import { CIVC_PROOF_LENGTH } from '@aztec/constants';
import { randomBytes } from '@aztec/foundation/crypto';
import { Fr } from '@aztec/foundation/fields';
import { bufferSchemaFor } from '@aztec/foundation/schemas';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';

export class ClientIvcProofWithPI {
  constructor(
    // The proof fields with public inputs.
    // For recursive verification, the public inputs (at the front of the array) must be removed.
    public proofWithPublicInputs: Fr[],
  ) {}

  public removePublicInputs() {
    const numPublicInputs = this.proofWithPublicInputs.length - CIVC_PROOF_LENGTH;
    return new ClientIvcProofWithoutPublicInputs(this.proofWithPublicInputs.slice(numPublicInputs));
  }

  public isEmpty() {
    return this.proofWithPublicInputs.length === 0;
  }

  static empty() {
    return new ClientIvcProofWithPI([]);
  }

  static random(proofSize = CIVC_PROOF_LENGTH) {
    // NB: Not using Fr.random here because it slows down some tests that require a large number of txs significantly.
    const reducedFrSize = Fr.SIZE_IN_BYTES - 1;
    const randomFields = randomBytes(proofSize * reducedFrSize);
    const proof = Array.from(
      { length: proofSize },
      (_, i) => new Fr(randomFields.subarray(i * reducedFrSize, (i + 1) * reducedFrSize)),
    );
    return new ClientIvcProofWithPI(proof);
  }

  static get schema() {
    return bufferSchemaFor(ClientIvcProofWithPI);
  }

  toJSON() {
    return this.toBuffer();
  }

  static fromBuffer(buffer: Buffer | BufferReader): ClientIvcProofWithPI {
    const reader = BufferReader.asReader(buffer);
    const proofLength = reader.readNumber();
    const proof = reader.readArray(proofLength, Fr);
    return new ClientIvcProofWithPI(proof);
  }

  public toBuffer() {
    return serializeToBuffer(this.proofWithPublicInputs.length, this.proofWithPublicInputs);
  }

  // Called when constructing a ClientIvcProof from proving results.
  static fromBufferArray(fields: Uint8Array[]): ClientIvcProofWithPI {
    const proof = fields.map(field => Fr.fromBuffer(Buffer.from(field)));
    return new ClientIvcProofWithPI(proof);
  }
}

export class ClientIvcProofWithoutPublicInputs {
  constructor(
    // The proof fields without public inputs.
    // For native verification, the public inputs must be attached.
    public proofWithoutPublicInputs: Fr[],
  ) {}

  public attachPublicInputs(publicInputs: Fr[]) {
    return new ClientIvcProofWithPI([...publicInputs, ...this.proofWithoutPublicInputs]);
  }

  public isEmpty() {
    return this.proofWithoutPublicInputs.length === 0;
  }

  static empty() {
    return new ClientIvcProofWithoutPublicInputs([]);
  }

  static random(proofSize = CIVC_PROOF_LENGTH) {
    // NB: Not using Fr.random here because it slows down some tests that require a large number of txs significantly.
    const reducedFrSize = Fr.SIZE_IN_BYTES - 1;
    const randomFields = randomBytes(proofSize * reducedFrSize);
    const proof = Array.from(
      { length: proofSize },
      (_, i) => new Fr(randomFields.subarray(i * reducedFrSize, (i + 1) * reducedFrSize)),
    );
    return new ClientIvcProofWithoutPublicInputs(proof);
  }

  static get schema() {
    return bufferSchemaFor(ClientIvcProofWithoutPublicInputs);
  }

  toJSON() {
    return this.toBuffer();
  }

  static fromBuffer(buffer: Buffer | BufferReader): ClientIvcProofWithoutPublicInputs {
    const reader = BufferReader.asReader(buffer);
    const proofLength = reader.readNumber();
    const proof = reader.readArray(proofLength, Fr);
    return new ClientIvcProofWithoutPublicInputs(proof);
  }

  public toBuffer() {
    return serializeToBuffer(this.proofWithoutPublicInputs.length, this.proofWithoutPublicInputs);
  }
}
