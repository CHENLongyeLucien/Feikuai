import {describe,expect,it} from 'vitest';
import {illustrativeRoute} from '../../apps/web/src/features/landing/globe-geometry';

const hashes=[
  ...Array.from({length:4},(_,index)=>`0x${'a'.repeat(63)}${index+1}`),
  `0x${'0'.repeat(64)}`,
  `0x${'f'.repeat(64)}`,
  `0x${'0123456789abcdef'.repeat(4)}`,
  `0x${'fedcba9876543210'.repeat(4)}`,
];
const landRadius=2.526;
const samples=(hash:string)=>{
  const {curve}=illustrativeRoute(hash);
  return Array.from({length:101},(_,index)=>curve.getPoint(index/100).toArray());
};

describe('illustrative globe transaction routes',()=>{
  it('keeps every sampled arc point finite and outside the land surface',()=>{
    // A raised quadratic control point can still leave the middle of a wide
    // route buried inside Earth. Check the complete path, including the
    // arc-length sampling used by the moving transaction pulse.
    for(const hash of hashes){
      const {curve}=illustrativeRoute(hash);
      for(let index=0;index<=100;index++){
        for(const point of [curve.getPoint(index/100),curve.getPointAt(index/100)]){
          expect(point.toArray().every(Number.isFinite)).toBe(true);
          expect(point.length(),`Buried route ${hash} at sample ${index}`).toBeGreaterThan(landRadius);
        }
      }
    }
  });

  it('meets its advertised start and end positions',()=>{
    for(const hash of hashes){
      const {curve,start,end}=illustrativeRoute(hash);
      expect(curve.getPoint(0).distanceTo(start)).toBeLessThan(1e-9);
      expect(curve.getPoint(1).distanceTo(end)).toBeLessThan(1e-9);
      expect(curve.getPointAt(0).distanceTo(start)).toBeLessThan(1e-9);
      expect(curve.getPointAt(1).distanceTo(end)).toBeLessThan(1e-9);
    }
  });

  it('is deterministic and distinguishes hashes sharing the same prefix',()=>{
    const original=hashes.map(samples);
    // Interleaving other records must not introduce shared mutable state.
    for(const hash of [...hashes].reverse())samples(hash);
    expect(hashes.map(samples)).toEqual(original);
    expect(new Set(original.map(points=>JSON.stringify(points))).size).toBe(hashes.length);
  });
});
