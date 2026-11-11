import {defineConfig} from '@playwright/test';
export default defineConfig({
  testDir:'.',testMatch:['regression.spec.mjs','subpath.spec.mjs'],fullyParallel:false,workers:1,retries:0,
  timeout:120000,expect:{timeout:15000},
  outputDir:'../../evidence/browser-regression/results',
  reporter:[['list'],['json',{outputFile:'../../evidence/browser-regression/results.json'}]],
  use:{baseURL:'http://127.0.0.1:4198',browserName:'chromium',viewport:{width:1280,height:900},acceptDownloads:true,trace:'retain-on-failure',screenshot:'only-on-failure',serviceWorkers:'block'},
  webServer:[{command:'node server.mjs',url:'http://127.0.0.1:4198',reuseExistingServer:false,timeout:10000},{command:'node subpath-server.mjs',url:'http://127.0.0.1:4199/__qa/health',reuseExistingServer:false,timeout:10000}]
});
