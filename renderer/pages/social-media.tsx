/**
 * Social Media Page
 * 
 * Página para gerenciamento de conteúdo para redes sociais.
 * Esta página está em branco e será implementada posteriormente.
 */

import React from 'react';

export default function SocialMediaPage() {
  return (
    <div style={{
      width: '100%',
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#0f0f0f',
      color: '#ffffff',
      fontFamily: 'Inter, system-ui, sans-serif',
    }}>
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '16px',
      }}>
        {/* Icon */}
        <svg 
          width="64" 
          height="64" 
          viewBox="0 0 24 24" 
          fill="none" 
          stroke="currentColor" 
          strokeWidth="1.5"
          style={{ opacity: 0.6 }}
        >
          <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
        </svg>
        
        <h1 style={{
          fontSize: '24px',
          fontWeight: 600,
          margin: 0,
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
        }}>
          Social Media
        </h1>
        
        <p style={{
          fontSize: '14px',
          color: '#666',
          margin: 0,
          textAlign: 'center',
          maxWidth: '300px',
        }}>
          Esta página está em desenvolvimento.
          Em breve você poderá gerenciar seu conteúdo para redes sociais aqui.
        </p>
      </div>
    </div>
  );
}
