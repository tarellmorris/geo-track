import type { ElevationPoint } from "../types";

interface ElevationChartProps {
  points: ElevationPoint[];
}

export function ElevationChart({ points }: ElevationChartProps) {
  const elevations = points
    .map((point) => point.elevation)
    .filter((elevation): elevation is number => elevation !== null);

  if (elevations.length < 2) {
    return <div className="chart-empty">No elevation samples</div>;
  }

  const width = 320;
  const height = 92;
  const min = Math.min(...elevations);
  const max = Math.max(...elevations);
  const range = Math.max(max - min, 1);
  const line = elevations
    .map((elevation, index) => {
      const x = (index / (elevations.length - 1)) * width;
      const y = height - ((elevation - min) / range) * (height - 12) - 6;
      return `${x},${y}`;
    })
    .join(" ");

  const area = `0,${height} ${line} ${width},${height}`;

  return (
    <div className="elevation-chart">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`Elevation profile from ${Math.round(min)} to ${Math.round(max)} meters`}
        preserveAspectRatio="none"
      >
        <polygon points={area} className="elevation-area" />
        <polyline points={line} className="elevation-line" />
      </svg>
      <div className="chart-scale">
        <span>{Math.round(min)} m</span>
        <span>{Math.round(max)} m</span>
      </div>
    </div>
  );
}
