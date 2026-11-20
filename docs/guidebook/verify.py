"""Offline Chrome E2E checks; requires agent-browser and its browser installation."""
from pathlib import Path
import hashlib
import json
import os
import subprocess

HERE = Path(__file__).resolve().parent
OUT = HERE / 'evidence'
OUT.mkdir(exist_ok=True)
os.environ.setdefault('AGENT_BROWSER_SOCKET_DIR', '/tmp/boss-guide-final-browser')

def ab(*args):
    return subprocess.run(['agent-browser', '--session', 'boss-guide-final', *map(str,args)], check=True, capture_output=True, text=True, timeout=60).stdout.strip()

def js(expression):
    return json.loads(json.loads(ab('eval', 'JSON.stringify('+expression+')')))

def stage(n):
    ab('eval', f"document.querySelector('#stage-{n}').scrollIntoView({{behavior:'instant',block:'center'}})")
    ab('wait','--fn', f"document.querySelector('.portrait').dataset.stage==='{n}'")

report = {'url': (HERE/'boss-raid-field-guide.html').as_uri(), 'viewports': [], 'screenshots': []}
def shot(name):
    ab('screenshot', OUT/name)
    report['screenshots'].append(name)

try:
    ab('open', report['url'])
    ab('set','offline','on')
    ab('set','media','light','no-preference')
    ab('reload')
    ab('eval','document.fonts.ready.then(()=>true)')
    report['fonts'] = js("({loaded:['BBH Bartle','Maple Mono'].every(f=>document.fonts.check('16px \"'+f+'\"')),count:document.fonts.size})")
    assert report['fonts']=={'loaded':True,'count':2}, report
    for w,h in [(320,740),(390,844),(834,1112),(1440,1000),(2560,1440)]:
        ab('set','viewport',w,h)
        ab('eval',"scrollTo({top:0,behavior:'instant'})")
        ab('wait','--fn',"document.querySelector('.art').dataset.pose==='ready'")
        state=js("""({width:innerWidth,height:innerHeight,overflow:document.documentElement.scrollWidth>innerWidth,headingsOverflow:[...document.querySelectorAll('h1,h2')].some(e=>e.scrollWidth>e.clientWidth+1),assetsLoaded:[...document.images].every(i=>i.complete&&i.naturalWidth>0),unlabeled:[...document.querySelectorAll('a,summary')].filter(e=>!(e.getAttribute('aria-label')||e.textContent).trim()).length,externalAssets:[...document.querySelectorAll('img,script[src],link[href]')].filter(e=>/^(https?:)?\\/\\//.test(e.getAttribute('src')||e.getAttribute('href')||'')).length,chapters:document.querySelectorAll('.chapter').length})""")
        assert not state['overflow'] and not state['headingsOverflow'], state
        assert state['assetsLoaded'] and state['unlabeled']==0 and state['externalAssets']==0 and state['chapters']==8,state
        shot(f'hero-{w}.png')
        for n in [1,3,6,8]:
            stage(n)
            assert not js("document.documentElement.scrollWidth>innerWidth")
            if w in [390,1440]: shot(f'stage-{n}-{w}.png')
        report['viewports'].append(state)
        print(f'PASS {w}×{h}',flush=True)
    ab('set','viewport',1440,1000)
    report['poses']=[]
    for n,pose in enumerate(['ready','ready','dispatch','dispatch','dispatch','ready','dispatch','salute'],1):
        stage(n)
        actual=js("document.querySelector('.art').dataset.pose")
        assert actual==pose,(n,actual)
        assert js("getComputedStyle(document.querySelector('.pose-' + document.querySelector('.art').dataset.pose)).opacity")=='1'
        report['poses'].append(actual)
    stage(1)
    ab('eval',"window.before=document.querySelector('.portrait').style.getPropertyValue('--parallax-y');window.sawSpeed=false;addEventListener('scroll',()=>requestAnimationFrame(()=>{window.sawSpeed=Number(document.querySelector('.speed-lines').style.opacity)>0}),{once:true});scrollBy({top:150,behavior:'instant'})")
    ab('wait','--fn',"window.sawSpeed&&document.querySelector('.portrait').style.getPropertyValue('--parallax-y')!==window.before")
    report['parallaxAndSpeedLines']=True
    stage(1)
    ab('eval',"{const b=document.querySelector('.visor-blink').getAnimations()[0];b.pause();b.currentTime=6000}")
    assert js("getComputedStyle(document.querySelector('.visor-blink')).opacity")=='1'
    shot('visor-blink-desktop.png')
    ab('set','viewport',390,844)
    ab('open',report['url'])
    ab('press','Tab')
    assert js("document.activeElement.classList.contains('skip')")
    ab('press','Enter')
    ab('wait','--fn',"location.hash==='#stage-1'&&document.activeElement.id==='stage-1'")
    report['keyboardSkip']=True
    ab('eval',"document.querySelector('.ending summary').focus()")
    ab('press','Enter')
    assert js("document.querySelector('details').open")
    report['keyboardDetails']=True
    ab('set','media','light','reduced-motion')
    stage(8)
    ab('wait','--fn',"document.querySelector('.portrait').style.getPropertyValue('--parallax-y')==='0px'")
    report['reducedMotion']=js("({preference:matchMedia('(prefers-reduced-motion: reduce)').matches,animations:document.getAnimations().length,scroll:getComputedStyle(document.documentElement).scrollBehavior,parallax:document.querySelector('.portrait').style.getPropertyValue('--parallax-y'),speedHidden:getComputedStyle(document.querySelector('.speed-lines')).display==='none',signal:getComputedStyle(document.querySelector('.mission-signal')).opacity})")
    assert report['reducedMotion']=={'preference':True,'animations':0,'scroll':'auto','parallax':'0px','speedHidden':True,'signal':'1'}, report['reducedMotion']
    report['mobileClosingEffectVisible']=js("(()=>{const r=document.querySelector('.mission-signal').getBoundingClientRect(),a=document.querySelector('.art').getBoundingClientRect();return r.left>=a.left&&r.right<=a.right&&r.top>=0&&r.bottom<=innerHeight})()")
    assert report['mobileClosingEffectVisible']
    shot('reduced-motion-mobile.png')
    ab('eval',"document.querySelector('footer').scrollIntoView({behavior:'instant'})")
    shot('footer-mobile.png')
    report['design']=js("({noEyebrows:!document.querySelector('.eyebrow'),noPause:!document.querySelector('button'),noShirtOverlay:!document.querySelector('.shirt-mark'),icons:document.querySelectorAll('.stitched-icon').length,rail:getComputedStyle(document.querySelector('.art')).backgroundColor,blend:getComputedStyle(document.querySelector('.portrait')).mixBlendMode,paper:getComputedStyle(document.body).backgroundColor})")
    assert report['design']=={'noEyebrows':True,'noPause':True,'noShirtOverlay':True,'icons':24,'rail':'rgb(0, 0, 0)','blend':'screen','paper':'rgb(255, 255, 255)'},report['design']
    report['browserErrors']=ab('errors')
    assert not report['browserErrors'],report['browserErrors']
    report['htmlSha256']=hashlib.sha256((HERE/'boss-raid-field-guide.html').read_bytes()).hexdigest()
    report['result']='PASS'
finally:
    (OUT/'verification.json').write_text(json.dumps(report,indent=2)+'\n')
    ab('set','offline','off')
    ab('close')
print(json.dumps(report,indent=2))
