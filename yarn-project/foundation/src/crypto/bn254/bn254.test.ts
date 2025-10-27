import { Fr } from '../../fields/fields.js';
import { Bn254G1Point, Bn254G2Point } from './index.js';

describe('Bn254 Point Classes', () => {
  const testScalar = Fr.fromString('0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef');

  describe('Bn254G1Point', () => {
    it('should get generator point with correct coordinates', async () => {
      const generator = await Bn254G1Point.generator();

      expect(generator.x.toBigInt()).toBe(1n);
      expect(generator.y.toBigInt()).toBe(2n);
    });

    it('should verify point is on curve', async () => {
      const point = await Bn254G1Point.generator(testScalar);
      const onCurve = await point.isOnCurve();

      expect(onCurve).toBe(true);
    });

    it('should check equality correctly', async () => {
      const point1 = await Bn254G1Point.generator(testScalar);
      const point2 = await Bn254G1Point.generator(testScalar);
      const point3 = await Bn254G1Point.generator(Fr.fromString('0x42'));

      expect(point1.equals(point2)).toBe(true);
      expect(point1.equals(point3)).toBe(false);
    });
  });

  describe('Bn254G2Point', () => {
    it('should produce different points for different scalars', async () => {
      const point1 = await Bn254G2Point.generator(Fr.fromString('0x01'));
      const point2 = await Bn254G2Point.generator(Fr.fromString('0x02'));

      expect(point1.equals(point2)).toBe(false);
    });

    it('should check equality correctly', async () => {
      const point1 = await Bn254G2Point.generator(testScalar);
      const point2 = await Bn254G2Point.generator(testScalar);
      const point3 = await Bn254G2Point.generator(Fr.fromString('0x42'));

      expect(point1.equals(point2)).toBe(true);
      expect(point1.equals(point3)).toBe(false);
    });
  });
});
