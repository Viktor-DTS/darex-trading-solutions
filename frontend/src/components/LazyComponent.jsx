import React, { Suspense, lazy } from 'react';

// Компонент для lazy loading з fallback
export function LazyComponent({ 
  importFunction, 
  fallback = <div>Завантаження...</div>,
  ...props 
}) {
  const LazyLoadedComponent = lazy(importFunction);
  
  return (
    <Suspense fallback={fallback}>
      <LazyLoadedComponent {...props} />
    </Suspense>
  );
}

// HOC для lazy loading
export function withLazyLoading(importFunction, fallback) {
  return function LazyWrapper(props) {
    return (
      <LazyComponent 
        importFunction={importFunction} 
        fallback={fallback} 
        {...props} 
      />
    );
  };
}

// Компонент для preloading
export function PreloadComponent({ importFunction, children }) {
  const [isPreloaded, setIsPreloaded] = React.useState(false);
  
  React.useEffect(() => {
    importFunction().then(() => {
      setIsPreloaded(true);
    });
  }, [importFunction]);
  
  return isPreloaded ? children : null;
}
