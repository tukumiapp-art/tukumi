import React, { useState, useEffect } from 'react';

const ProgressiveImage = ({ src, placeholder, className, ...props }) => {
  const [currentSrc, setCurrentSrc] = useState(placeholder || src);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // If no placeholder is provided, just use the src immediately
    if (!placeholder) {
      setCurrentSrc(src);
      setLoading(false);
      return;
    }

    const img = new Image();
    img.src = src;
    img.onload = () => {
      setCurrentSrc(src);
      setLoading(false);
    };
  }, [src, placeholder]);

  return (
    <img
      {...props}
      src={currentSrc}
      className={`${className} transition-all duration-500 ${
        loading ? 'blur-sm scale-105' : 'blur-0 scale-100'
      }`}
      alt={props.alt || ''}
    />
  );
};

export default ProgressiveImage;