import React, { createContext, useContext, useEffect, useState } from 'react';

const ThemeContext = createContext();

export const ThemeProvider = ({ children }) => {
  // State: Initialize theme state by checking localStorage. 
  // Default to 'light' if no preference is found.
  // Possible values are 'light' or 'reading'.
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('theme') || 'light';
  });

  // --- EFFECT 1: APPLY CLASS AND SAVE PREFERENCE ---
  useEffect(() => {
    const root = window.document.documentElement;
    
    // 1. Clean up classes: Remove both possible theme classes first.
    // Note: 'dark' is also removed to ensure it's not active, although 
    // this provider doesn't support 'dark' mode currently.
    root.classList.remove('dark');
    root.classList.remove('reading'); // Use 'reading' as the class name
    root.classList.remove('light');   // Remove the 'light' class if present

    // 2. Apply Theme
    if (theme === 'reading') {
      root.classList.add('reading');
    } else {
      root.classList.add('light'); // Default to 'light' class
    }

    // 3. Save Preference
    localStorage.setItem('theme', theme);

  }, [theme]); // Reruns whenever the theme state changes

  // --- EFFECT 2: DYNAMIC STYLES FOR READING MODE ---
  // This useEffect handles the dynamic injection/removal of the special 
  // 'Reading Mode' CSS to override background/text colors with warm tones.
  useEffect(() => {
    const styleId = 'reading-mode-styles';
    let styleTag = document.getElementById(styleId);

    if (theme === 'reading') {
      if (!styleTag) {
        // Create the style tag if it doesn't exist
        styleTag = document.createElement('style');
        styleTag.id = styleId;
        styleTag.innerHTML = `
          /* --- READING MODE OVERRIDES (Applied when <html> has class 'reading') --- */
          .reading body {
            background-color: #F8F5E6 !important; /* Warm Paper Background */
            color: #4A3B2A !important;           /* Dark Coffee Text */
          }
          
          /* Override White Cards */
          .reading .bg-white, 
          .reading .md\\:bg-white,
          .reading .glass-panel {
            background-color: #FFFCF0 !important; /* Softer Cream for Cards */
            border-color: #E8E0C5 !important;
            color: #4A3B2A !important;
          }

          /* Soften Grays */
          .reading .text-gray-500,
          .reading .text-gray-600, 
          .reading .text-gray-400 {
            color: #8C7B65 !important; /* Warm Gray */
          }

          /* Dark Text becomes Soft Brown */
          .reading .text-dark {
            color: #2E2218 !important;
          }

          /* Input Fields */
          .reading input, 
          .reading textarea, 
          .reading .bg-gray-50,
          .reading .bg-gray-100 {
            background-color: #F0EAD6 !important; /* Eggshell */
            border-color: #DBCDAF !important;
            color: #4A3B2A !important;
          }
          
          /* Hover States */
          .reading .hover\\:bg-gray-50:hover {
            background-color: #EBE0C5 !important;
          }
        `;
        document.head.appendChild(styleTag);
      }
    } else {
      // Remove the style tag if theme is not 'reading'
      if (styleTag) {
        styleTag.remove();
      }
    }
  }, [theme]); // Reruns whenever the theme state changes

  // Function to toggle between 'light' and 'reading'
  const toggleTheme = () => {
    setTheme(prev => (prev === 'light' ? 'reading' : 'light'));
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);