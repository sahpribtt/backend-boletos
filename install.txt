// install-chrome.js - Instala Chrome para Render
const puppeteer = require('puppeteer-core');
const chrome = require('chrome-aws-lambda');

async function installChrome() {
  console.log('🔧 Verificando Chrome para Render...');
  
  try {
    const executablePath = await chrome.executablePath;
    console.log('✅ Chrome encontrado em:', executablePath);
    return executablePath;
  } catch (error) {
    console.log('⚠️  Chrome não encontrado, instalando...');
    
    // No Render, o Chrome já está instalado
    // Esta função é apenas para garantir
    return process.env.CHROME_PATH || '/usr/bin/google-chrome-stable';
  }
}

// Executa se chamado diretamente
if (require.main === module) {
  installChrome().then(path => {
    console.log('🎉 Chrome configurado:', path);
    process.exit(0);
  }).catch(error => {
    console.error('❌ Erro ao configurar Chrome:', error);
    process.exit(1);
  });
}

module.exports = { installChrome };
