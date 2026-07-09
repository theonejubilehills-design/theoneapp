import React from 'react';

interface GlassCardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  glow?: boolean;
  hoverGlow?: boolean;
}

export const GlassCard: React.FC<GlassCardProps> = ({
  children,
  glow = false,
  hoverGlow = false,
  className = '',
  ...props
}) => {
  const cardClasses = `glass-card ${glow ? 'accent-glow' : ''} ${hoverGlow ? 'accent-hover' : ''} ${className}`;

  return (
    <div className={cardClasses} {...props}>
      {children}
    </div>
  );
};

export default GlassCard;
