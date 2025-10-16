import { Fr } from '@aztec/foundation/fields';
import { SiblingPath, UnbalancedMerkleTreeCalculator, computeUnbalancedMerkleTreeRoot } from '@aztec/foundation/trees';

export function getL2ToL1MessageLeafId(
  membershipWitness: Pick<L2ToL1MembershipWitness, 'leafIndex' | 'siblingPath'>,
): bigint {
  return 2n ** BigInt(membershipWitness.siblingPath.pathSize) + membershipWitness.leafIndex;
}

export interface MessageRetrieval {
  getL2ToL1Messages(epoch: bigint): Promise<Fr[][][][]>;
}

export type L2ToL1MembershipWitness = {
  root: Fr;
  leafIndex: bigint;
  siblingPath: SiblingPath<number>;
};

export async function computeL2ToL1MembershipWitness(
  messageRetriever: MessageRetrieval,
  epoch: bigint,
  message: Fr,
): Promise<L2ToL1MembershipWitness | undefined> {
  const messagesInEpoch = await messageRetriever.getL2ToL1Messages(epoch);
  if (messagesInEpoch.length === 0) {
    return undefined;
  }

  return computeL2ToL1MembershipWitnessFromMessagesInEpoch(messagesInEpoch, message);
}

// TODO: Allow to specify the message to consume by its index or by an offset, in case there are multiple messages with
// the same value.
export function computeL2ToL1MembershipWitnessFromMessagesInEpoch(
  messagesInEpoch: Fr[][][][],
  message: Fr,
): L2ToL1MembershipWitness {
  // Find the index of the message in the tx, index of the tx in the block, and index of the block in the epoch.
  let messageIndexInTx = -1;
  let txIndex = -1;
  let blockIndex = -1;
  const checkpointIndex = messagesInEpoch.findIndex(messagesInCheckpoint => {
    blockIndex = messagesInCheckpoint.findIndex(messagesInBlock => {
      txIndex = messagesInBlock.findIndex(messagesInTx => {
        messageIndexInTx = messagesInTx.findIndex(msg => msg.equals(message));
        return messageIndexInTx !== -1;
      });
      return txIndex !== -1;
    });
    return blockIndex !== -1;
  });

  if (checkpointIndex === -1) {
    throw new Error('The L2ToL1Message you are trying to prove inclusion of does not exist');
  }

  // Build the tx tree.
  const messagesInTx = messagesInEpoch[checkpointIndex][blockIndex][txIndex];
  const txTree = UnbalancedMerkleTreeCalculator.create(messagesInTx.map(msg => msg.toBuffer()));
  // Get the sibling path of the target message in the tx tree.
  const pathToMessageInTxSubtree = txTree.getSiblingPathByLeafIndex(messageIndexInTx);

  // Build the tree of the block containing the target message.
  const blockTree = buildBlockTree(messagesInEpoch[checkpointIndex][blockIndex]);
  // Get the sibling path of the tx out hash in the block tree.
  const pathToTxOutHashInBlockTree = blockTree.getSiblingPathByLeafIndex(txIndex);

  // Build the tree of the checkpoint containing the target message.
  const checkpointTree = buildCheckpointTree(messagesInEpoch[checkpointIndex]);
  // Get the sibling path of the block out hash in the checkpoint tree.
  const pathToBlockOutHashInCheckpointTree = checkpointTree.getSiblingPathByLeafIndex(blockIndex);

  // Compute the out hashes of all checkpoints in the epoch.
  const checkpointOutHashes = messagesInEpoch.map((messagesInCheckpoint, i) => {
    if (i === checkpointIndex) {
      return checkpointTree.getRoot();
    }
    return buildCheckpointTree(messagesInCheckpoint).getRoot();
  });
  // Build the epoch tree with all the checkpoint out hashes.
  const epochTree = buildCompressedTree(checkpointOutHashes);
  // Get the sibling path of the block out hash in the epoch tree.
  const pathToCheckpointOutHashInEpochTree = epochTree.getSiblingPathByLeafIndex(checkpointIndex);

  // The root of the epoch tree should match the `out_hash` in the root rollup's public inputs.
  // Zero hashes are compressed to reduce cost if the non-zero leaves result in a shorter path.
  const root = Fr.fromBuffer(epochTree.getRoot());

  // Compute the combined sibling path by appending the tx subtree path to the block tree path, then to the checkpoint
  // tree path, then to the epoch tree path.
  const combinedPath = pathToMessageInTxSubtree
    .toBufferArray()
    .concat(pathToTxOutHashInBlockTree.toBufferArray())
    .concat(pathToBlockOutHashInCheckpointTree.toBufferArray())
    .concat(pathToCheckpointOutHashInEpochTree.toBufferArray());

  // Compute the combined index.
  // It is the index of the message in the balanced tree (by filling up the wonky tree with empty nodes) at its current
  // height. It's used to validate the membership proof.
  const messageLeafPosition = txTree.getLeafLocation(messageIndexInTx);
  const txLeafPosition = blockTree.getLeafLocation(txIndex);
  const blockLeafPosition = checkpointTree.getLeafLocation(blockIndex);
  const checkpointLeafPosition = epochTree.getLeafLocation(checkpointIndex);
  const numLeavesInLeftCheckpoints = checkpointLeafPosition.index * (1 << blockLeafPosition.level);
  const indexAtCheckpointLevel = numLeavesInLeftCheckpoints + blockLeafPosition.index;
  const numLeavesInLeftBlocks = indexAtCheckpointLevel * (1 << txLeafPosition.level);
  const indexAtTxLevel = numLeavesInLeftBlocks + txLeafPosition.index;
  const numLeavesInLeftTxs = indexAtTxLevel * (1 << messageLeafPosition.level);
  const combinedIndex = numLeavesInLeftTxs + messageLeafPosition.index;

  return {
    root,
    leafIndex: BigInt(combinedIndex),
    siblingPath: new SiblingPath(combinedPath.length, combinedPath),
  };
}

function buildCheckpointTree(messagesInCheckpoint: Fr[][][]) {
  const blockOutHashes = messagesInCheckpoint.map(messagesInBlock => buildBlockTree(messagesInBlock).getRoot());
  return buildCompressedTree(blockOutHashes);
}

function buildBlockTree(messagesInBlock: Fr[][]) {
  const txOutHashes = messagesInBlock.map(messages =>
    computeUnbalancedMerkleTreeRoot(messages.map(msg => msg.toBuffer())),
  );
  return buildCompressedTree(txOutHashes);
}

function buildCompressedTree(leaves: Buffer[]) {
  // Note: If a block or tx has no messages (i.e. leaf == Buffer.alloc(32)), we ignore that branch and only accumulate
  // the non-zero hashes to match what the circuits do.
  const valueToCompress = Buffer.alloc(32);
  return UnbalancedMerkleTreeCalculator.create(leaves, valueToCompress);
}
