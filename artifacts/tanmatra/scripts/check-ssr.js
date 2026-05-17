const fs = require('fs');
const path = require('path');

const routes = ['/', '/menu', '/wellness', '/performance', '/clinical', '/team', '/faq'];
const distDir = path.resolve(__dirname, '../build/client'); // React router v7 output dir for prerendered routes is build/client

let failed = false;

routes.forEach(route => {
  // If route is / it produces index.html, else /menu produces menu/index.html or menu.html
  let filePath = path.join(distDir, route === '/' ? 'index.html' : `${route}/index.html`);
  if (!fs.existsSync(filePath)) {
    filePath = path.join(distDir, route === '/' ? 'index.html' : `${route}.html`);
  }
  
  if (!fs.existsSync(filePath)) {
    console.error(`❌ Route ${route} was not prerendered.`);
    failed = true;
    return;
  }

  const html = fs.readFileSync(filePath, 'utf8');
  if (html.includes('<div id="root"></div>') && !html.includes('<html')) {
    console.error(`❌ Route ${route} did not contain real content (found generic root).`);
    failed = true;
  } else {
    console.log(`✅ Route ${route} prerendered successfully.`);
  }
});

if (failed) {
  process.exit(1);
} else {
  console.log('✅ All in-scope routes prerendered correctly!');
}
