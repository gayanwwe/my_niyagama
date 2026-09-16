import React from 'react';

interface SkeletonProps {
  className?: string;
  width?: string | number;
  height?: string | number;
  circle?: boolean;
}

export const Skeleton: React.FC<SkeletonProps> = ({ className = '', width, height, circle }) => {
  return (
    <div
      className={`animate-pulse bg-slate-200 ${circle ? 'rounded-full' : 'rounded-xl'} ${className}`}
      style={{ width, height }}
    />
  );
};

export const CardSkeleton = () => (
  <div className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-slate-100 space-y-4">
    <Skeleton height={40} width="60%" />
    <Skeleton height={20} width="40%" />
    <div className="flex gap-2">
      <Skeleton height={32} width={80} />
      <Skeleton height={32} width={80} />
    </div>
  </div>
);

export const AlbumSkeleton = () => (
  <div className="aspect-square bg-white p-4 rounded-[2.5rem] shadow-sm border border-slate-100 space-y-4">
    <Skeleton height="70%" className="rounded-3xl" />
    <Skeleton height={20} width="80%" />
  </div>
);

export default Skeleton;
