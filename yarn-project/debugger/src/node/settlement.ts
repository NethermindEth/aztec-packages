import type { AztecLifecycleState, AztecTraceAnchors, AztecTraceStatus } from '@aztec/stdlib/debug';
import { TxStatus } from '@aztec/stdlib/tx';

export type SettlementMapping = {
  status: AztecTraceStatus;
  lifecycleState: AztecLifecycleState;
};

export type SettlementInput = {
  /** `TxStatus` reported by `AztecNodeService.getTxReceipt`. */
  txStatus: TxStatus;
  /** L2 block number carried by the tx receipt, if the tx is mined. */
  receiptBlockNumber?: number;
  /** Latest block number proven on L1, from `AztecNodeService.getProvenBlockNumber`. */
  provenBlockNumber: number;
  /** Whether the node reported the tx as known (pool/archiver hit). */
  known: boolean;
};

/**
 * Map `TxStatus` + anchor block data to the debugger `AztecTraceStatus` and
 * `AztecLifecycleState`. Pure function; no async I/O.
 */
export function mapTxStatusToLifecycleState(input: SettlementInput): SettlementMapping {
  if (!input.known || input.txStatus === TxStatus.DROPPED) {
    return { status: 'error', lifecycleState: 'dropped' };
  }

  switch (input.txStatus) {
    case TxStatus.PENDING:
      return { status: 'awaiting_settlement', lifecycleState: 'pending_in_mempool' };
    case TxStatus.PROPOSED:
      return { status: 'awaiting_settlement', lifecycleState: 'proposed_l2' };
    case TxStatus.CHECKPOINTED:
      return { status: 'awaiting_settlement', lifecycleState: 'checkpointed' };
    case TxStatus.PROVEN: {
      const provenOnL1 = input.receiptBlockNumber !== undefined && input.receiptBlockNumber <= input.provenBlockNumber;
      return provenOnL1
        ? { status: 'ok', lifecycleState: 'proven_on_l1' }
        : { status: 'awaiting_settlement', lifecycleState: 'checkpointed' };
    }
    case TxStatus.FINALIZED:
      return { status: 'ok', lifecycleState: 'finalized' };
    default:
      return { status: 'error', lifecycleState: 'dropped' };
  }
}

export function buildAnchors(input: {
  txHash: string;
  traceId?: string;
  receiptBlockNumber?: number;
  receiptBlockHash?: string;
}): AztecTraceAnchors {
  const anchors: AztecTraceAnchors = { txHash: input.txHash };
  if (input.traceId !== undefined) {
    anchors.provisionalTraceId = input.traceId;
  }
  if (input.receiptBlockNumber !== undefined) {
    anchors.l2BlockNumber = input.receiptBlockNumber;
  }
  if (input.receiptBlockHash !== undefined) {
    anchors.l2BlockHash = input.receiptBlockHash;
  }
  return anchors;
}
