import React from 'react'
import type { AppProps } from 'next/app'

import '../styles/globals.css'

import Script from 'next/script'

function MyApp({ Component, pageProps }: AppProps) {
  return (
    <>
      <Script 
        src="/live2dcubismcore.min.js" 
        strategy="beforeInteractive" 
      />
      <Component {...pageProps} />
    </>
  )
}

export default MyApp
