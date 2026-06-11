// Vetor de drift global — mesma direção para todas as camadas,
// magnitude proporcional à profundidade (parallax)
export const drift = (frame: number) => ({
  x: Math.sin(frame / 41),
  y: Math.cos(frame / 57),
});

// depth: 5 = fundo, 15 = notebook/objeto, 25 = texto
export const parallax = (frame: number, depth: number) => {
  const d = drift(frame);
  return { x: d.x * depth, y: d.y * depth };
};
