import { sha256Trunc } from '@aztec/foundation/crypto';
import { Fr } from '@aztec/foundation/fields';

import {
  type L2ToL1MembershipWitness,
  computeL2ToL1MembershipWitnessFromMessagesInEpoch,
  getL2ToL1MessageLeafId,
} from './l2_to_l1_membership.js';

describe('L2 to L1 membership', () => {
  let foundLeafIds: Set<bigint>;

  const msgHashes = (numMsgs: number) => {
    return Array.from({ length: numMsgs }, () => Fr.random());
  };

  const hasher = (left: Buffer, right: Buffer) => sha256Trunc(Buffer.concat([left, right]));

  // This should match the implementation in Outbox.sol -> verifyMembership
  const verifyMembership = (leaf: Fr, witness: L2ToL1MembershipWitness) => {
    let subtreeRoot = leaf.toBuffer();
    let indexAtHeight = witness.leafIndex;
    const path = witness.siblingPath.toBufferArray();
    for (let height = 0; height < path.length; height++) {
      const isRight = (indexAtHeight & 1n) === 1n;
      subtreeRoot = isRight ? hasher(path[height], subtreeRoot) : hasher(subtreeRoot, path[height]);
      indexAtHeight >>= 1n;
    }
    expect(subtreeRoot).toEqual(witness.root.toBuffer());
  };

  const verifyMembershipForMessagesInEpoch = (messagesInEpoch: Fr[][][][]): L2ToL1MembershipWitness[] => {
    const messages = messagesInEpoch.flat(3);
    return messages.map(msg => {
      const witness = computeL2ToL1MembershipWitnessFromMessagesInEpoch(messagesInEpoch, msg);
      const leafId = getL2ToL1MessageLeafId(witness);
      expect(foundLeafIds.has(leafId)).toBe(false);
      foundLeafIds.add(leafId);
      verifyMembership(msg, witness);
      return witness;
    });
  };

  beforeEach(() => {
    foundLeafIds = new Set();
  });

  describe('one block in one checkpoint in the epoch', () => {
    it('throws if the message is not found', () => {
      const messagesInEpoch = [[[msgHashes(3), msgHashes(1)]]];
      const targetMsg = Fr.random();
      expect(() => computeL2ToL1MembershipWitnessFromMessagesInEpoch(messagesInEpoch, targetMsg)).toThrow(
        'The L2ToL1Message you are trying to prove inclusion of does not exist',
      );
    });

    it('a single tx with 1 message', () => {
      const txMessages = msgHashes(1);
      const messagesInEpoch = [[[txMessages]]];
      const witnesses = verifyMembershipForMessagesInEpoch(messagesInEpoch);

      const m0 = witnesses[0];
      expect(m0.leafIndex).toBe(0n);
      expect(m0.siblingPath.pathSize).toBe(0);
    });

    it('a single tx with 2 messages', () => {
      //     tx
      //   /   \
      //  m0    m1

      const txMessages = msgHashes(2);
      const messagesInEpoch = [[[txMessages]]];
      const witnesses = verifyMembershipForMessagesInEpoch(messagesInEpoch);

      {
        const m0 = witnesses[0];
        expect(m0.leafIndex).toBe(0n);
        expect(m0.siblingPath.pathSize).toBe(1);
      }

      {
        const m1 = witnesses[1];
        expect(m1.leafIndex).toBe(1n);
        expect(m1.siblingPath.pathSize).toBe(1);
      }
    });

    it('a single tx with messages in a wonky tree', () => {
      //       tx
      //      /   \
      //     .    m2
      //   /   \
      // m0   m1

      const txMessages = msgHashes(3);
      const messagesInEpoch = [[[txMessages]]];
      const witnesses = verifyMembershipForMessagesInEpoch(messagesInEpoch);

      {
        const m0 = witnesses[0];
        expect(m0.leafIndex).toBe(0n);
        expect(m0.siblingPath.pathSize).toBe(2);
      }

      {
        const m2 = witnesses[2];
        expect(m2.leafIndex).toBe(1n);
        expect(m2.siblingPath.pathSize).toBe(1);
      }
    });

    it('2 txs, one has 0 messages, one has 1 message', () => {
      //       root     ---->   m0
      //      /   \
      //    []    m0

      const tx1 = msgHashes(1);
      const messagesInEpoch = [[[[], tx1]]];
      const witnesses = verifyMembershipForMessagesInEpoch(messagesInEpoch);

      const m0 = witnesses[0];
      expect(m0.leafIndex).toBe(0n);
      expect(m0.siblingPath.pathSize).toBe(0);
      expect(m0.root).toEqual(tx1[0]);
    });

    it('multiple txs in a wonky tree, each tx has 1 message', () => {
      //       root
      //      /   \
      //     .    m2
      //   /   \
      // m0   m1

      const tx0 = msgHashes(1);
      const tx1 = msgHashes(1);
      const tx2 = msgHashes(1);
      const messagesInEpoch = [[[tx0, tx1, tx2]]];
      const witnesses = verifyMembershipForMessagesInEpoch(messagesInEpoch);

      {
        const m0 = witnesses[0];
        expect(m0.leafIndex).toBe(0n);
        expect(m0.siblingPath.pathSize).toBe(2);
      }

      {
        const m2 = witnesses[2];
        expect(m2.leafIndex).toBe(1n);
        expect(m2.siblingPath.pathSize).toBe(1);
      }
    });

    it('multiple txs in a wonky tree, one tx has 0 messages', () => {
      //       root      ---->    root
      //      /   \              /   \
      //     .    m1           m0   m1
      //   /   \
      // m0   []

      const tx0 = msgHashes(1);
      const tx2 = msgHashes(1);
      // tx1 has no messages.
      const messagesInEpoch = [[[tx0, [], tx2]]];
      const witnesses = verifyMembershipForMessagesInEpoch(messagesInEpoch);

      {
        const m0 = witnesses[0];
        expect(m0.leafIndex).toBe(0n);
        expect(m0.siblingPath.pathSize).toBe(1);
      }

      {
        const m1 = witnesses[1];
        expect(m1.leafIndex).toBe(1n);
        expect(m1.siblingPath.pathSize).toBe(1);
      }
    });

    it('multiple txs in a wonky tree, each tx has messages in a balanced tree', () => {
      //       root
      //      /   \
      //     .    tx2
      //   /   \
      // tx0  tx1

      const tx0 = msgHashes(2);
      const tx1 = msgHashes(4);
      const tx2 = msgHashes(2);
      const messagesInEpoch = [[[tx0, tx1, tx2]]];
      const witnesses = verifyMembershipForMessagesInEpoch(messagesInEpoch);

      {
        //    tx0
        //   /   \
        // m0   m1

        // m0
        const m0 = witnesses[0];
        // 2 edges from root to tx0, 1 edge from tx0 to m0
        expect(m0.siblingPath.pathSize).toBe(2 + 1);
        // The leaf is at index 0n in its tx subtree (height = 1), which has no tx subtrees on its left.
        expect(m0.leafIndex).toBe(0n);
      }

      {
        //      tx1
        //     /   \
        //    .    .
        //  /  \  /  \
        // m2 m3 m4 m5

        // m0
        const m2 = witnesses[2];
        // 2 edges from root to tx1, 2 edges from tx1 to m2
        expect(m2.siblingPath.pathSize).toBe(2 + 2);
        // The leaf is at index 0n in its tx subtree (height = 2), which has 1 tx subtree on its left.
        expect(m2.leafIndex).toBe(0n + 1n * (1n << 2n));

        // m4
        const m4 = witnesses[4];
        // 2 edges from root to tx1, 2 edges from tx1 to m2
        expect(m4.siblingPath.pathSize).toBe(2 + 2);
        // The leaf is at index 2n in its tx subtree (height = 2), which has 1 tx subtree on its left.
        expect(m4.leafIndex).toBe(2n + 1n * (1n << 2n));
      }

      {
        //    tx2
        //   /   \
        // m6   m7

        // m7
        const m7 = witnesses[7];
        // 1 edge from root to tx2, 1 edge from tx2 to m1
        expect(m7.siblingPath.pathSize).toBe(1 + 1);
        // The leaf is at index 1n in its tx subtree (height = 1), which has 1 tx subtree on its left.
        expect(m7.leafIndex).toBe(1n + 1n * (1n << 1n));
      }
    });

    it('multiple txs in a wonky tree, each tx has messages in a wonky tree', () => {
      //       root
      //      /   \
      //     .    tx2
      //   /   \
      // tx0  tx1

      const tx0 = msgHashes(5);
      const tx1 = msgHashes(3);
      const tx2 = msgHashes(7);
      const messagesInEpoch = [[[tx0, tx1, tx2]]];
      const witnesses = verifyMembershipForMessagesInEpoch(messagesInEpoch);

      {
        //        tx0
        //        /  \
        //       .    m4
        //     /   \
        //    .    .
        //  /  \  /  \
        // m0 m1 m2 m3

        // m2
        const m2 = witnesses[2];
        // 2 edges from root to tx0, 3 edges from tx0 to m2
        expect(m2.siblingPath.pathSize).toBe(2 + 3);
        // The leaf is at index 2n in its tx subtree (height = 3), which has no tx subtrees on its left.
        expect(m2.leafIndex).toBe(2n);

        // m4
        const m4 = witnesses[4];
        // 2 edges from root to tx0, 1 edge from tx0 to m4
        expect(m4.siblingPath.pathSize).toBe(2 + 1);
        // The leaf is at index 1n in its tx subtree (height = 1), which has no tx subtrees on its left.
        expect(m4.leafIndex).toBe(1n);
      }

      {
        //       tx1
        //      /   \
        //     .    m7
        //   /   \
        // m5   m6

        // m0
        const m5 = witnesses[5];
        // 2 edges from root to tx1, 2 edges from tx1 to m0
        expect(m5.siblingPath.pathSize).toBe(2 + 2);
        // The leaf is at index 0n in its tx subtree (height = 2), which has 1 tx subtree on its left.
        expect(m5.leafIndex).toBe(0n + 1n * (1n << 2n));

        // m7
        const m7 = witnesses[7];
        // 2 edges from root to tx1, 1 edge from tx1 to m2
        expect(m7.siblingPath.pathSize).toBe(2 + 1);
        // The leaf is at index 1n in its tx subtree (height = 1), which has 1 tx subtree on its left.
        expect(m7.leafIndex).toBe(1n + 1n * (1n << 1n));
      }

      {
        //             tx2
        //        /          \
        //       .            .
        //     /   \         / \
        //    .    .        .  m14
        //  /  \  /  \     / \
        // m8 m9 m10 m11 m12 m13

        // m11
        const m11 = witnesses[11];
        // 1 edge from root to tx2, 3 edges from tx2 to m3
        expect(m11.siblingPath.pathSize).toBe(1 + 3);
        // The leaf is at index 3n in its tx subtree (height = 3), which has 1 tx subtree on its left.
        expect(m11.leafIndex).toBe(3n + 1n * (1n << 3n));

        // m12
        const m12 = witnesses[12];
        // 1 edge from root to tx2, 3 edges from tx2 to m4
        expect(m12.siblingPath.pathSize).toBe(1 + 3);
        // The leaf is at index 4n in its tx subtree (height = 3), which has 1 tx subtree on its left.
        expect(m12.leafIndex).toBe(4n + 1n * (1n << 3n));

        // m14
        const m14 = witnesses[14];
        // 1 edge from root to tx2, 2 edges from tx2 to m6
        expect(m14.siblingPath.pathSize).toBe(1 + 2);
        // The leaf is at index 3n in its tx subtree (height = 2), which has 1 tx subtree on its left.
        expect(m14.leafIndex).toBe(3n + 1n * (1n << 2n));
      }
    });

    it('multiple txs in a wonky tree, some txs have 0 messages, other txs have more than 1 message', () => {
      //              root        ---->     root
      //         /          \              /   \
      //         .          .            tx2   tx6
      //      /    \       /  \
      //    .      .      .   tx6
      //   /  \   /  \   /  \
      //  [] [] tx2 []  [] []

      const tx2 = msgHashes(3);
      const tx6 = msgHashes(7);
      const messagesInEpoch = [[[[], [], tx2, [], [], [], tx6]]];
      const witnesses = verifyMembershipForMessagesInEpoch(messagesInEpoch);

      {
        //       tx2
        //      /   \
        //     .    m2
        //   /   \
        // m0   m1

        // m0
        const m0 = witnesses[0];
        // 1 edge from root to tx2, 2 edges from tx2 to m0.
        expect(m0.siblingPath.pathSize).toBe(1 + 2);
        // The leaf is at index 0n in its tx subtree (height = 2), which has no tx subtrees on its left.
        expect(m0.leafIndex).toBe(0n);

        // m2
        const m2 = witnesses[2];
        // 1 edges from root to tx2, 1 edge from tx2 to m2.
        expect(m2.siblingPath.pathSize).toBe(1 + 1);
        // The leaf is at index 1n in its tx subtree (height = 1), which has no tx subtrees on its left.
        expect(m2.leafIndex).toBe(1n);
      }

      {
        //           tx6
        //        /        \
        //       .          .
        //     /   \       / \
        //    .    .      .  m9
        //  /  \  /  \   / \
        // m3 m4 m5 m6  m7 m8

        // m6
        const m6 = witnesses[6];
        // 1 edge from root to tx6, 3 edges from tx6 to m3.
        expect(m6.siblingPath.pathSize).toBe(1 + 3);
        // The leaf is at index 3n in its tx subtree (height = 3), which has 1 tx subtree on its left.
        expect(m6.leafIndex).toBe(3n + 1n * (1n << 3n));

        // m7
        const m7 = witnesses[7];
        // 1 edge from root to tx6, 3 edges from tx6 to m4
        expect(m7.siblingPath.pathSize).toBe(1 + 3);
        // The leaf is at index 4n in its tx subtree (height = 3), which has 1 tx subtree on its left.
        expect(m7.leafIndex).toBe(4n + 1n * (1n << 3n));

        // m9
        const m9 = witnesses[9];
        // 1 edge from root to tx6, 2 edges from tx6 to m6
        expect(m9.siblingPath.pathSize).toBe(1 + 2);
        // The leaf is at index 3n in its tx subtree (height = 2), which has 1 tx subtree on its left.
        expect(m9.leafIndex).toBe(3n + 1n * (1n << 2n));
      }
    });
  });

  describe('one block per checkpoint, multiple checkpoints in the epoch', () => {
    it('3 checkpoints, each has 1 block that has txs with 1 message', () => {
      //          root
      //       /        \
      //      .         c2
      //    /   \      /  \
      //  c0    c1    m4  m5
      //  /    /   \
      // m0   .    m3
      //    /  \
      //   m1 m2

      const checkpoint0 = [[msgHashes(1)]];
      const checkpoint1 = [[msgHashes(1), msgHashes(1), msgHashes(1)]];
      const checkpoint2 = [[msgHashes(1), msgHashes(1)]];
      const messagesInEpoch = [checkpoint0, checkpoint1, checkpoint2];
      const witnesses = verifyMembershipForMessagesInEpoch(messagesInEpoch);

      {
        const m0 = witnesses[0];
        expect(m0.leafIndex).toBe(0n);
        expect(m0.siblingPath.pathSize).toBe(2);
      }

      {
        const m1 = witnesses[1];
        expect(m1.leafIndex).toBe(4n);
        expect(m1.siblingPath.pathSize).toBe(4);
      }

      {
        const m4 = witnesses[4];
        expect(m4.leafIndex).toBe(2n);
        expect(m4.siblingPath.pathSize).toBe(2);
      }
    });

    it('3 checkpoints, each has 1 block, 1 block has txs with no messages, 2 block have txs with 1 message', () => {
      //             root     ---->   root
      //           /     \           /    \
      //          .      c2        c0     c2
      //        /  \    /  \      /  \    / \
      //      c0   c1  m3  m4   .   m2  m3  m4
      //     /  \              /  \
      //    .   m2            m0  m1
      //  /  \
      // m0  m1

      const checkpoint0 = [[msgHashes(1), msgHashes(1), msgHashes(1)]];
      const checkpoint1 = [[[]], [[], []]];
      const checkpoint2 = [[msgHashes(1), msgHashes(1)]];
      const messagesInEpoch = [checkpoint0, checkpoint1, checkpoint2];
      const witnesses = verifyMembershipForMessagesInEpoch(messagesInEpoch);

      {
        const m0 = witnesses[0];
        expect(m0.leafIndex).toBe(0n);
        expect(m0.siblingPath.pathSize).toBe(3);
      }

      {
        const m2 = witnesses[2];
        expect(m2.leafIndex).toBe(1n);
        expect(m2.siblingPath.pathSize).toBe(2);
      }

      {
        const m4 = witnesses[4];
        expect(m4.leafIndex).toBe(3n);
        expect(m4.siblingPath.pathSize).toBe(2);
      }
    });

    it('3 checkpoints, each has 1 block, each block have multiple txs with or without messages', () => {
      //             root     ---->   root
      //           /      \           /    \
      //          .       c2        c0     c1
      //        /    \     /  \    /  \    / \
      //      c0     c1   [] []   m0  m1  .  m4
      //     /  \    /  \                /  \
      //    .   []  .  []              m2  m3
      //  /  \     / \
      // []  tx1  .   .
      //    /  \     / \
      //   m0  m1   tx5 []

      const checkpoint0 = [[[], msgHashes(2), []]];
      const checkpoint1 = [[[], [], msgHashes(3), [], []]];
      const checkpoint2 = [[[], []]];
      const messagesInEpoch = [checkpoint0, checkpoint1, checkpoint2];
      const witnesses = verifyMembershipForMessagesInEpoch(messagesInEpoch);

      {
        const m0 = witnesses[0];
        expect(m0.leafIndex).toBe(0n);
        expect(m0.siblingPath.pathSize).toBe(2);
      }

      {
        const m2 = witnesses[2];
        expect(m2.leafIndex).toBe(4n);
        expect(m2.siblingPath.pathSize).toBe(3);
      }

      {
        const m4 = witnesses[4];
        expect(m4.leafIndex).toBe(3n);
        expect(m4.siblingPath.pathSize).toBe(2);
      }
    });
  });

  describe('multiple blocks in one checkpoint in the epoch', () => {
    it('3 blocks in a wonky tree, each block has 1 tx with 1 message', () => {
      //       root
      //      /   \
      //     .    b2
      //   /   \
      // b0   b1

      const blocks = Array.from({ length: 3 }, () => msgHashes(1));
      const messagesInEpoch = [[blocks]];
      const witnesses = verifyMembershipForMessagesInEpoch(messagesInEpoch);

      {
        const m0 = witnesses[0];
        expect(m0.leafIndex).toBe(0n);
        expect(m0.siblingPath.pathSize).toBe(2);
      }

      {
        const m1 = witnesses[1];
        expect(m1.leafIndex).toBe(1n);
        expect(m1.siblingPath.pathSize).toBe(2);
      }

      {
        const m2 = witnesses[2];
        expect(m2.leafIndex).toBe(1n);
        expect(m2.siblingPath.pathSize).toBe(1);
      }
    });

    it('3 blocks, 2 has 0 messages, 1 has multiple messages from 2 txs', () => {
      //       root     ---->   b1
      //      /   \            /   \
      //     .    b2         tx0  tx1
      //    / \              / \    / \
      //   b0 b1           m0 m1 .   m4
      //                        /  \
      //                       m2 m3

      const tx0 = msgHashes(2);
      const tx1 = msgHashes(3);
      const block1 = [tx0, tx1];
      // block0 and block2 have no messages.
      const messagesInEpoch = [[[], block1, []]];
      const witnesses = verifyMembershipForMessagesInEpoch(messagesInEpoch);

      {
        const m0 = witnesses[0];
        expect(m0.leafIndex).toBe(0n);
        expect(m0.siblingPath.pathSize).toBe(2);
      }

      {
        const m3 = witnesses[3];
        expect(m3.leafIndex).toBe(5n);
        expect(m3.siblingPath.pathSize).toBe(3);
      }

      {
        const m4 = witnesses[4];
        expect(m4.leafIndex).toBe(3n);
        expect(m4.siblingPath.pathSize).toBe(2);
      }
    });

    it('5 blocks in a wonky tree, 2 have no messages, 3 have some or all txs that have messages', () => {
      //               root            ---->          root
      //           /           \                 /           \
      //          .             b4              .             b4
      //       /     \        /  \           /     \         /  \
      //      .      .       .   tx7        b0     b3      tx6   tx7
      //     /  \   / \     / \            / \    /  \
      //    b0  b1 b2 b3  tx5 tx6        tx0 tx1 tx2 tx4
      //   /  \      /  \
      // tx0 tx1    .  tx4
      //           / \
      //         tx2 tx3

      const tx0 = msgHashes(2); // m0, m1
      const tx1 = msgHashes(1); // m2
      const block0 = [tx0, tx1];

      const block1 = [[], []];

      const block2 = [[], [], []];

      const tx2 = msgHashes(3); // m3, m4, m5
      // tx3 has no messages.
      const tx4 = msgHashes(2); // m6, m7
      const block3 = [tx2, [], tx4];

      // tx5 has no messages.
      const tx6 = msgHashes(5); // m8, m9, m10, m11, m12
      const tx7 = msgHashes(2); // m13, m14
      const block4 = [[], tx6, tx7];

      const messagesInEpoch = [[block0, block1, block2, block3, block4]];
      const witnesses = verifyMembershipForMessagesInEpoch(messagesInEpoch);

      {
        const m0 = witnesses[0];
        expect(m0.leafIndex).toBe(0n);
        expect(m0.siblingPath.pathSize).toBe(4);
      }
      {
        const m2 = witnesses[2];
        expect(m2.leafIndex).toBe(1n);
        expect(m2.siblingPath.pathSize).toBe(3);
      }
      {
        const m3 = witnesses[3];
        expect(m3.leafIndex).toBe(8n);
        expect(m3.siblingPath.pathSize).toBe(5);
      }
      {
        const m7 = witnesses[7];
        expect(m7.leafIndex).toBe(7n);
        expect(m7.siblingPath.pathSize).toBe(4);
      }
      {
        const m8 = witnesses[8];
        expect(m8.leafIndex).toBe(16n);
        expect(m8.siblingPath.pathSize).toBe(5);
      }
      {
        const m10 = witnesses[10];
        expect(m10.leafIndex).toBe(18n);
        expect(m10.siblingPath.pathSize).toBe(5);
      }
      {
        const m12 = witnesses[12];
        expect(m12.leafIndex).toBe(5n);
        expect(m12.siblingPath.pathSize).toBe(3);
      }
      {
        const m14 = witnesses[14];
        expect(m14.leafIndex).toBe(7n);
        expect(m14.siblingPath.pathSize).toBe(3);
      }
    });

    it('a complex epoch with multiple blocks, txs, and messages', () => {
      const messagesInEpoch = [
        [
          [msgHashes(5), [], msgHashes(8), msgHashes(6), []],
          [[], msgHashes(1), [], []],
          [msgHashes(1), msgHashes(2), msgHashes(13), [], msgHashes(7)],
          [[], [], [], msgHashes(9)],
          [[], msgHashes(2), msgHashes(2), [], [], [], [], [], [], [], [], msgHashes(1)],
          [msgHashes(1), [], msgHashes(11)],
          [[], [], [], [], [], [], [], [], msgHashes(11), [], [], [], [], []],
          [[], [], [], [], [], [], msgHashes(5), [], [], [], [], [], [], [], msgHashes(4), []],
          [[], [], [], [], [], [], [], [], [], [], [], []],
          [[], [], [], [], msgHashes(3), [], []],
        ],
      ];
      verifyMembershipForMessagesInEpoch(messagesInEpoch);
    });
  });

  describe('multiple blocks per checkpoint, multiple checkpoints in the epoch', () => {
    it('a complex epoch with multiple checkpoints, blocks, txs, and messages', () => {
      const messagesInEpoch = [
        [
          [msgHashes(5), [], msgHashes(8), msgHashes(6), []],
          [[], msgHashes(1), [], []],
          [msgHashes(1), msgHashes(2), msgHashes(13), [], msgHashes(7)],
          [[], [], [], msgHashes(9)],
          [[], msgHashes(2), msgHashes(2), [], [], [], [], [], [], [], [], msgHashes(1)],
          [msgHashes(1), [], msgHashes(11)],
          [[], [], [], [], [], [], [], [], msgHashes(11), [], [], [], [], []],
          [[], [], [], [], [], [], msgHashes(5), [], [], [], [], [], [], [], msgHashes(4), []],
          [[], [], [], [], [], [], [], [], [], [], [], []],
          [[], [], [], [], msgHashes(3), [], []],
        ],
        [[[], []], [[], [], []], [[]]],
        [
          [[], msgHashes(3), [], []],
          [[], []],
        ],
        [[[]], [[], [], [], [], []]],
        [
          [[], [], []],
          [msgHashes(1), [], [], []],
          [[]],
          [[], [], msgHashes(2)],
          [msgHashes(1), [], msgHashes(3)],
          [msgHashes(5)],
        ],
      ];
      verifyMembershipForMessagesInEpoch(messagesInEpoch);
    });

    it('1 message in the epoch', () => {
      const [msg] = msgHashes(1);
      const messagesInEpoch = [
        [[[], []], [[], [], []], [[]]],
        [[[]], [[], []]],
        [[[], []], [[]], [[msg]], [[]]],
        [[[], []]],
        [[[], []], [[]], [[], [], []], [[], []]],
      ];
      const witness = computeL2ToL1MembershipWitnessFromMessagesInEpoch(messagesInEpoch, msg);
      expect(witness.leafIndex).toBe(0n);
      expect(witness.siblingPath.pathSize).toBe(0);
      expect(witness.root).toEqual(msg);
    });
  });
});
