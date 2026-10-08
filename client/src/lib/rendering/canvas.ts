export function setupCanvas(canvas: HTMLCanvasElement): { ctx: CanvasRenderingContext2D; cleanup: () => void } {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Failed to get 2D context');
  
  // Set up canvas size
  const resize = () => {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    
    // Use setTransform to avoid compounding scale on resize
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
    
    // Re-enable crisp pixel rendering after resize
    ctx.imageSmoothingEnabled = false;
  };
  
  resize();
  window.addEventListener('resize', resize);
  
  // Return cleanup function to remove event listener
  const cleanup = () => {
    window.removeEventListener('resize', resize);
  };
  
  return { ctx, cleanup };
}

export function clearCanvas(ctx: CanvasRenderingContext2D) {
  const canvas = ctx.canvas;
  const dpr = window.devicePixelRatio || 1;
  const cssWidth = canvas.width / dpr;
  const cssHeight = canvas.height / dpr;
  ctx.clearRect(0, 0, cssWidth, cssHeight);
}

export function drawBackground(ctx: CanvasRenderingContext2D) {
  const canvas = ctx.canvas;
  const width = canvas.width / (window.devicePixelRatio || 1);
  const height = canvas.height / (window.devicePixelRatio || 1);
  
  // Enhanced gradient background with more vibrant colors
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, '#1e1b4b'); // Deep indigo
  gradient.addColorStop(0.5, '#312e81'); // Violet
  gradient.addColorStop(1, '#1f2937'); // Dark gray
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  
  // Add radial highlight in center
  const centerGradient = ctx.createRadialGradient(width / 2, height / 2, 0, width / 2, height / 2, width / 2);
  centerGradient.addColorStop(0, 'rgba(147, 51, 234, 0.1)'); // Purple glow
  centerGradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = centerGradient;
  ctx.fillRect(0, 0, width, height);
  
  // Subtle grid pattern
  ctx.strokeStyle = 'rgba(147, 51, 234, 0.08)'; // Purple tinted grid
  ctx.lineWidth = 1;
  const gridSize = 30;
  
  for (let i = 0; i < width; i += gridSize) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, height);
    ctx.stroke();
  }
  
  for (let i = 0; i < height; i += gridSize) {
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(width, i);
    ctx.stroke();
  }
}
