// Paraxial teaching geometry. Distances are millimetres and powers are dioptres.
window.PositiveLens = (() => {
  // Integral of 2r weighted by a smooth cutoff across the peripheral band.
  function effectiveRadiusSquared(r, outer, inner) {
    if (inner >= outer || r <= inner) return r * r;
    const width = outer - inner;
    const u = Math.min(1, (r - inner) / width);
    return inner * inner + 2 * width * (
      inner * (u - u ** 3 + u ** 4 / 2) +
      width * (u ** 2 / 2 - 3 * u ** 4 / 4 + 2 * u ** 5 / 5)
    );
  }
  function frontPower(lens, refined) {
    const base = Math.max(0, Number(lens.BC) || lens.D);
    return refined ? Math.min(base, lens.D / 2) : base;
  }
  function front(lens, radius, refined) {
    return ( (lens.blankDia / 2) ** 2 - radius ** 2 ) * frontPower(lens, refined) / (2000 * (lens.n - 1));
  }
  function thickness(lens, radius, meridianPower, innerDiameter) {
    const outer = lens.blankDia / 2;
    const inner = Math.min(outer, Math.max(0, innerDiameter / 2));
    const centerSag = lens.D * effectiveRadiusSquared(outer, outer, inner);
    const localSag = meridianPower * effectiveRadiusSquared(radius, outer, inner);
    return Math.max(0, lens.edgeT + (centerSag - localSag) / (2000 * (lens.n - 1)));
  }
  return Object.freeze({ frontPower, front, thickness });
})();

// 周邊後表面承接內區切線，逐漸反向修薄，曲率維持同一方向直到片緣。
function minusPeripheralBack(join,edge,tangent,span,u){
  const rise=tangent*span;
  return join+rise*u+(edge-join-rise)*u*u;
}
