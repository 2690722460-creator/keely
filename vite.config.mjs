import {defineConfig} from 'vite';
import tailwindcss from '@tailwindcss/vite';
export default defineConfig({
 publicDir:false,
 plugins:[tailwindcss()],
 build:{outDir:'assets/works-carousel',emptyOutDir:true,target:'es2020',lib:{entry:'src/main.tsx',name:'PortfolioWorksCarousel',formats:['iife'],fileName:()=> 'works-carousel.js'},sourcemap:false},
 define:{'process.env.NODE_ENV':JSON.stringify('production')}
});
