const {spawnSync}=require('child_process');
// Build: docker build -f docker/test-web-entrypoint.Dockerfile -t open-ai-canvas-web:entrypoint-test .
const image=process.env.CANVAS_WEB_TEST_IMAGE||'open-ai-canvas-web:entrypoint-test',container='canvas-web-lock-regression-'+process.pid;
function docker(args,{input,ok=[0]}={}){const r=spawnSync('docker',args,{input,encoding:'utf8',maxBuffer:1024*1024});if(!ok.includes(r.status))throw Error('Regression command failed ('+r.status+'): '+JSON.stringify(args)+' '+(r.stderr||r.stdout||'').slice(-700));return r;}
const setup=`set -eu
mkdir -p /test/release/assets /test/html/.canvas-publish-lock /test/bin
printf new-html >/test/release/index.html
printf new-asset >/test/release/assets/current.js
printf old-html >/test/html/index.html
printf '#!/bin/sh\ntouch /test/nginx-started\nexec sleep 300\n' >/test/bin/nginx
printf '#!/bin/sh\nif test ! -e /test/copy-started; then touch /test/copy-started; sleep 300; fi\nexec /bin/cp "$@"\n' >/test/bin/cp
chmod +x /test/bin/*
`;
async function waitFor(file){for(let n=0;n<40;n++){if(docker(['exec',container,'test','-f',file],{ok:[0,1,126]}).status===0)return;await new Promise(r=>setTimeout(r,250));}throw Error('Missing regression state '+file);}
async function main(){
 const reports=[];
 try{
  docker(['create','--name',container,'--network','none','--no-healthcheck','--entrypoint','sh','-e','CANVAS_WEB_RELEASE_DIR=/test/release','-e','CANVAS_WEB_HTML_DIR=/test/html',image,'-c','if test ! -d /test/release; then '+setup+' fi; export PATH=/test/bin:$PATH; exec /usr/local/bin/canvas-web-entrypoint']);
  docker(['start',container]);await waitFor('/test/copy-started');
  if(docker(['exec',container,'cat','/test/html/index.html']).stdout!=='old-html')throw Error('HTML switched before copy completed');
  docker(['kill','--signal','KILL',container]);docker(['start',container]);await waitFor('/test/nginx-started');
  if(docker(['exec',container,'cat','/test/html/index.html']).stdout!=='new-html')throw Error('Publication did not recover');
  reports.push('SIGKILL during publication recovers with stale legacy directory and file lock');
  docker(['exec',container,'sh','-c','test ! -d /test/html/.canvas-stage.invalid; test -s /test/html/assets/current.js']);
  docker(['exec',container,'sh','-c','exec 9>/test/html/.canvas-publish.lock; flock -n 9']);
  reports.push('Nginx does not inherit the publication lock');
  docker(['exec','-d',container,'sh','-c','exec 9>/test/html/.canvas-publish.lock; flock -n 9; touch /test/held; sleep 300']);await waitFor('/test/held');
  const competing=docker(['exec',container,'sh','-c','PATH=/test/bin:$PATH /usr/local/bin/canvas-web-entrypoint'],{ok:[1]});
  if(!competing.stderr.includes('Another publication'))throw Error('Concurrent writer not rejected');reports.push('Concurrent publication remains blocked');
  docker(['exec',container,'rm','/test/nginx-started']);docker(['kill','--signal','KILL',container]);docker(['start',container]);await waitFor('/test/nginx-started');
  // Independent temporary roots test a failure inside a pipeline, not just cp failure.
  docker(['exec',container,'sh','-c','mkdir -p /test/fail/assets /test/fail-bin; printf previous >/test/fail/index.html; printf "#!/bin/sh\\nexit 23\\n" >/test/fail-bin/mv; chmod +x /test/fail-bin/mv']);
  docker(['exec',container,'sh','-c','CANVAS_WEB_HTML_DIR=/test/fail PATH=/test/fail-bin:/test/bin:$PATH /usr/local/bin/canvas-web-entrypoint'],{ok:[23]});
  if(docker(['exec',container,'cat','/test/fail/index.html']).stdout!=='previous')throw Error('Failed publication replaced existing HTML');
  docker(['exec',container,'sh','-c','exec 9>/test/fail/.canvas-publish.lock; flock -n 9']);reports.push('Pipeline failure preserves previous HTML and releases lock');
  docker(['exec',container,'sh','-c','CANVAS_WEB_HTML_DIR=/test/fail PATH=/test/bin:$PATH timeout 2 /usr/local/bin/canvas-web-entrypoint'],{ok:[124,143]});
  if(docker(['exec',container,'cat','/test/fail/index.html']).stdout!=='new-html')throw Error('Failed publication retry did not recover');reports.push('Publication retries successfully after failure');
  console.log(JSON.stringify({passed:reports.length,reports}));
 }finally{docker(['rm','-f',container],{ok:[0,1]});}
}main().catch(e=>{console.error(e.message);process.exitCode=1;});
