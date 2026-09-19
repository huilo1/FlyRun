'use client';
import { useEffect, useRef, useState } from 'react';
import { Play, Pause, RotateCcw, Shuffle, ArrowUpRight, Activity, MoveRight, FlaskConical, Download, Check, ChevronDown } from 'lucide-react';
import { Slider } from '@/components/ui/slider';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { createWorld, createFly, sense, advanceFly, hashSeed } from '../lib/world.mjs';
import { drawWorld, drawBrain } from '../lib/draw-world.mjs';
import { DEFAULT_NEURAL_OPTIONS } from '../lib/sensor-encoder.mjs';
import neuralWorkerURL from '../lib/neural/worker.js?worker&url';

type Phase = 'idle' | 'loading' | 'running' | 'paused' | 'escaped' | 'error';
const labels = ['Ходьба · L', 'Ходьба · R', 'Поворот · L', 'Поворот · R', 'Назад', 'Ускорение'];
const cells = ['DNp09 / DNg100 / DNg97', 'DNp09 / DNg100 / DNg97', 'DNa02 / DNa11 / DNg13', 'DNa02 / DNa11 / DNg13', 'MDN', 'DNp01'];
const defaultOptions = { ...DEFAULT_NEURAL_OPTIONS, rays: true, trail: true };
export default function FlyLab() {
  const canvas = useRef<HTMLCanvasElement>(null), brainCanvas = useRef<HTMLCanvasElement>(null);
  const sim = useRef<any>(null), worker = useRef<Worker | null>(null), timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const watchdog = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [phase, setPhase] = useState<Phase>('idle'), phaseRef = useRef<Phase>('idle');
  const [options, setOptions] = useState(defaultOptions), optionsRef = useRef(defaultOptions);
  const [seed, setSeed] = useState('FLY-042'), [density, setDensity] = useState(10);
  const [progress, setProgress] = useState(0), [stage, setStage] = useState(''), [backend, setBackend] = useState(''), [fallback, setFallback] = useState('');
  const [snapshot, setSnapshot] = useState<any>({ time: 0, distance: 0, collisions: 0, speed: 0, actualSpeed: 0, rates: [0,0,0,0,0,0], behavior: 'Готова к исследованию', active: 0, wallMs: 0, signals: {}, sensors: {}, directMotorCount: 0 });
  const [error, setError] = useState('');
  function changePhase(p: Phase) { phaseRef.current = p; setPhase(p); }
  function updateOption(key: keyof typeof defaultOptions, value: number | boolean) { setOptions(old => { const next = { ...old, [key]: value }; optionsRef.current = next; return next; }); }
  function step() {
    const s = sim.current;
    if (!s || phaseRef.current !== 'running' || s.busy || !worker.current) return;
    s.busy = true; s.sentAt = performance.now();
    worker.current.postMessage({ type: 'step', generation: s.generation, sensors: sense(s.world, s.fly), options: optionsRef.current });
  }
  function publish(force = false) {
    const s = sim.current;
    if (!s) return;
    if (force || performance.now() - s.published > 100) {
      s.published = performance.now();
      setSnapshot({ ...s.fly, active: s.active || 0, wallMs: s.wallMs || 0, signals: s.signals || {}, directMotorCount: s.directMotorCount || 0, sensors: sense(s.world, s.fly) });
    }
  }
  useEffect(() => {
    sim.current = { world: createWorld(), fly: createFly(), generation: 0, busy: false, anatomy: [], firing: new Set(), published: 0 };
    let raf = 0;
    const render = () => {
      const s = sim.current;
      if (canvas.current) drawWorld(canvas.current, s.world, s.fly, sense(s.world, s.fly), optionsRef.current);
      if (brainCanvas.current) drawBrain(brainCanvas.current, s.anatomy, s.firing);
      raf = requestAnimationFrame(render);
    };
    render(); publish(true);
    return () => { cancelAnimationFrame(raf); worker.current?.terminate(); if (timer.current) clearTimeout(timer.current); if (watchdog.current) clearTimeout(watchdog.current); };
  }, []);
  function start(preferCPU = false) {
    if (phaseRef.current === 'running') { changePhase('paused'); return; }
    if (phaseRef.current === 'paused') { changePhase('running'); step(); return; }
    if ((phaseRef.current === 'loading' && !preferCPU) || phaseRef.current === 'escaped') return;
    if (watchdog.current) clearTimeout(watchdog.current);
    worker.current?.terminate(); setError(''); setProgress(0); setFallback(''); setStage('Загрузка связей MaleCNS…'); changePhase('loading');
    const s = sim.current; s.fly = createFly(); s.generation = 0; s.busy = false;
    const fail = (message: string) => { if (watchdog.current) clearTimeout(watchdog.current); setError(message); changePhase('error'); s.busy = false; worker.current?.terminate(); worker.current = null; };
    let w: Worker;
    try {
      // Use Vite's emitted URL directly: RSC can rewrite import.meta.url to file://.
      w = new Worker(neuralWorkerURL, { type: 'module' }); worker.current = w;
    } catch (cause) {
      fail(`Не удалось запустить модуль мозга: ${cause instanceof Error ? cause.message : String(cause)}`);
      return;
    }
    const armWatchdog = () => {
      if (watchdog.current) clearTimeout(watchdog.current);
      watchdog.current = setTimeout(() => {
        if (worker.current === w && phaseRef.current === 'loading') fail('Подготовка мозга не отвечает уже 60 секунд. Попробуйте запустить на CPU.');
      }, 60000);
    };
    armWatchdog();
    w.onerror = e => { if (worker.current === w) fail(e.message || 'Не удалось запустить вычисления. Попробуйте ещё раз.'); };
    w.onmessage = ({ data: m }) => {
      if (worker.current !== w) return;
      if (phaseRef.current === 'loading') armWatchdog();
      if (m.type === 'progress') setProgress(m.value * 100);
      if (m.type === 'stage') setStage(m.message.startsWith('Loading') ? 'Загрузка и проверка связей MaleCNS…' : m.message);
      if (m.type === 'fallback') setFallback('WebGPU недоступен. Используется CPU: симуляция может идти медленнее.');
      if (m.type === 'error') { fail(m.message); return; }
      if (m.type === 'ready') { if (watchdog.current) clearTimeout(watchdog.current); setProgress(100); s.anatomy = m.anatomy; setBackend(m.backend === 'gpu' ? 'WebGPU' : 'CPU'); changePhase('running'); step(); }
      if (m.type === 'reset' && m.generation === s.generation) { s.busy = false; if (phaseRef.current === 'running') step(); }
      if (m.type === 'result' && m.generation === s.generation) {
        s.busy = false; s.wallMs = m.wallMs; s.active = m.active; s.firing = new Set(m.firing); s.signals = m.signals; s.directMotorCount = m.directMotorCount;
        advanceFly(s.world, s.fly, m.rates, m.dt); publish(s.fly.escaped);
        if (s.fly.escaped) { changePhase('escaped'); return; }
        if (phaseRef.current === 'running') timer.current = setTimeout(step, Math.max(0, 10 - (performance.now() - s.sentAt)));
      }
    };
    try { w.postMessage({ type: 'init', assetBase: new URL('/neural/', location.href).href, backend: preferCPU ? 'cpu' : 'auto', seed: hashSeed(s.world.seed) }); }
    catch (cause) { fail(cause instanceof Error ? cause.message : String(cause)); }
  }
  function reset(newMap = false) {
    if (phaseRef.current === 'loading') return;
    const s = sim.current, value = newMap ? 'FLY-' + Math.floor(Math.random() * 999999).toString().padStart(6, '0') : seed.trim() || 'FLY-042';
    if (timer.current) clearTimeout(timer.current);
    setSeed(value); s.world = createWorld(value, density); s.fly = createFly(); s.firing = new Set(); s.active = 0; s.signals = {}; s.directMotorCount = 0; s.generation++;
    if (worker.current) { s.busy = true; changePhase('paused'); worker.current.postMessage({ type: 'reset', generation: s.generation, seed: hashSeed(value) }); }
    else { s.busy = false; changePhase('idle'); }
    publish(true);
  }
  const loaded = !['idle', 'loading', 'error'].includes(phase);
  return <main className="lab-shell">
    <header className="app-header"><div className="brand"><span className="brand-symbol">f<span>↗</span></span><div><h1>FlyRun<span> / </span><small>Нейронный лабиринт</small></h1><p>Drosophila melanogaster · MaleCNS v1.0</p></div></div><div className="header-status"><span className={phase === 'running' ? 'status-dot live' : 'status-dot'} />{phase === 'running' ? 'Эксперимент идёт' : phase === 'loading' ? 'Подготовка мозга' : phase === 'escaped' ? 'Выход найден' : 'Лаборатория поведения'}<span className="version">EXP. 003</span></div></header>
    <div className="workbench">
      <section className="arena-panel" aria-label="Комната-лабиринт">
        <div className="section-heading"><div><span className="eyebrow">01 / СРЕДА</span><h2>Найти выход</h2></div><span className="room-tag">100 × 68 mm <span>·</span> вид сверху</span></div>
        <div className="arena-wrap"><canvas ref={canvas} className="arena" aria-label="Муха в случайной комнате. Голубые лучи — датчики, зелёная линия — пройденный путь." />
          <div className="arena-status"><span className={phase === 'running' ? 'status-dot live' : 'status-dot'} />{snapshot.behavior}</div>
          {phase === 'escaped' && <div className="success-banner"><Check size={24}/><strong>Выход найден</strong><span>{snapshot.time.toFixed(1)} с модельного времени · {snapshot.distance.toFixed(0)} mm</span><button onClick={() => reset(true)}>Следующая комната <MoveRight size={16}/></button></div>}
        </div>
        <div className="arena-legend"><span><i className="swatch wall"/>Преграда</span><span><i className="swatch danger"/>Опасная поверхность</span><span><i className="swatch exit"/>Светящийся выход</span><label><Checkbox checked={options.rays} onCheckedChange={v => updateOption('rays', v)}/>Датчики</label><label><Checkbox checked={options.trail} onCheckedChange={v => updateOption('trail', v)}/>След</label></div>
        <div className="transport"><button className="primary-button" disabled={phase === 'loading' || phase === 'escaped'} onClick={() => start()}>{phase === 'loading' ? <Activity className="spin" size={18}/> : phase === 'running' ? <Pause size={18}/> : loaded ? <Play size={18}/> : <Download size={18}/>} {phase === 'loading' ? 'Загружаем мозг…' : phase === 'running' ? 'Пауза' : phase === 'paused' ? 'Продолжить' : 'Запустить мозг'}</button><button className="icon-button" onClick={() => reset()} disabled={phase === 'loading'} title="Сначала, с тем же seed" aria-label="Повторить эксперимент"><RotateCcw size={18}/></button><button className="secondary-button" onClick={() => reset(true)} disabled={phase === 'loading'}><Shuffle size={17}/>Новая комната</button><div className="runtime">{backend || 'Локальные вычисления'}<small>{loaded ? `модель / реальность ≈ ${Math.min(1, 10 / Math.max(1, snapshot.wallMs)).toFixed(2)}×` : '~76 МБ · без API-ключа'}</small></div></div>
        {phase === 'loading' && <div className="load-state"><div><span>{stage}</span><b>{Math.round(progress)}%</b></div><Progress value={progress}/></div>}
        {(phase === 'loading' || phase === 'error') && <button className="secondary-button recovery-button" onClick={() => start(true)}>Запустить на CPU</button>}
        {error && <p role="alert" className="error-note">{error} Нажмите «Запустить мозг», чтобы повторить.</p>}
        {fallback && <p className="small-note">{fallback}</p>}
        <div className="metrics"><div><span>Модельное время</span><strong>{snapshot.time.toFixed(1)}<small>с</small></strong></div><div><span>Пройдено</span><strong>{snapshot.distance.toFixed(1)}<small>mm</small></strong></div><div><span>Фактическая скорость</span><strong>{snapshot.actualSpeed.toFixed(1)}<small>mm/с</small></strong></div><div><span>Касания</span><strong>{snapshot.collisions.toString().padStart(2, '0')}</strong></div></div>
        <div className="room-settings"><label className="seed-field">Seed комнаты<input value={seed} maxLength={40} onChange={e => setSeed(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') reset(); }} disabled={phase === 'loading'}/></label><div className="density-field"><div><label id="density-label">Преграды в новой комнате</label><output>{density}</output></div><Slider aria-labelledby="density-label" value={[density]} min={4} max={14} step={1} onValueChange={v => setDensity(Array.isArray(v) ? v[0] : v)}/></div><button className="text-button" onClick={() => reset()} disabled={phase === 'loading'}>Применить <MoveRight size={15}/></button></div>
      </section>
      <aside className="brain-panel"><div className="section-heading"><div><span className="eyebrow">02 / НЕРВНАЯ СИСТЕМА</span><h2>От сигнала к движению</h2></div><Activity size={19} className="muted-icon"/></div>
        <div className="anatomy"><canvas ref={brainCanvas} aria-label="Проекция координат нейронов MaleCNS; зелёным показаны активные клетки из отображаемой выборки."/><span>166 700 нейронов</span><small>25,6 млн связей</small></div>
        <div className="signal-heading"><span>Сенсорные входы</span><small>СТИМУЛ · Hz</small></div>
        <div className="sensory-grid">{[['LC9', 'visual', 'Фоновый зрительный вход'], ['LC10a', 'target', 'Видимый светящийся объект'], ['LC16', 'loom', 'Близость и приближение преград'], ['LC4', 'danger', 'Изменение близости опасной поверхности']].map(([label,key,title]) => <div key={key} title={title}><span>{label} · L / R</span><strong>{Math.round(snapshot.signals[key + 'Left'] || 0)} / {Math.round(snapshot.signals[key + 'Right'] || 0)}</strong></div>)}</div>
        <div className="neural-divider"><span/><Activity size={14}/><span/><small>спайки → частота → действие</small></div>
        <div className="signal-heading"><span>Моторные выходы</span><small>АКТИВНОСТЬ · Hz</small></div>
        <div className="motor-readouts">{labels.map((label,i) => <div className="motor-row" key={label}><div><span>{label}</span><small>{cells[i]}</small></div><div className="rate-bar"><i style={{width:`${Math.min(100,snapshot.rates[i]/2.5)}%`}}/></div><output>{Math.round(snapshot.rates[i])}</output></div>)}</div>
        <p className="mdn-diagnostic">Прямо стимулируемых моторных нейронов: {snapshot.directMotorCount}<br/>MDN: стимул {Math.round(snapshot.signals.reverse || 0)} Гц · выход {Math.round(snapshot.rates[4])} Гц<br/><span>{snapshot.sensors.contactRear ? 'Контакт при движении назад' : snapshot.sensors.contactFront ? 'Контакт при движении вперёд' : 'Контакта нет'}</span></p>
        <p className="adapter-note">{options.assisted ? "Контрольный режим: прямые двигательные входы" : "Сенсорный режим"}{options.silenced ? " · связи выключены" : " · связи включены"}</p><div className="active-summary"><span className="status-dot live"/><span>{snapshot.active.toLocaleString('ru-RU')} активных клеток</span><small>за 10 мс</small></div>
        <details className="experiment-settings"><summary><FlaskConical size={16}/>Настройки эксперимента<ChevronDown size={15}/></summary><div className="settings-inner"><div className="gain-label"><label id="gain-label">Сила стимуляции</label><output>{options.gain.toFixed(1)}×</output></div><Slider aria-labelledby="gain-label" min={0} max={2} step={.1} value={[options.gain]} onValueChange={v=>updateOption('gain',Array.isArray(v)?v[0]:v)}/><label><Checkbox checked={options.sensory} onCheckedChange={v=>updateOption('sensory',v)}/>Обратная связь от среды</label><label><Checkbox checked={options.assisted} onCheckedChange={v=>updateOption('assisted',v)}/>Прямые DN-входы · контрольный режим</label><label><Checkbox checked={!options.silenced} onCheckedChange={v=>updateOption('silenced',!v)}/>Передача по связям</label><p>По умолчанию передача по связям включена, прямые DN-входы выключены. Снимите галочку передачи, чтобы проверить остановку моторного ответа. Для сравнения с нуля нажмите ↺ с тем же seed. Прямые DN-входы позволяют двигаться и без связей.</p></div></details>
      </aside>
    </div>
    <footer className="lab-footer"><div className="loop-caption"><span>СРЕДА</span><MoveRight size={15}/><span>ДАТЧИКИ</span><MoveRight size={15}/><span>КОННЕКТОМ</span><MoveRight size={15}/><span>ДВИЖЕНИЕ</span><span className="loop-return">↩</span></div><p>Экспериментальная модель поведения. Муха может не найти выход.</p><a href="https://huggingface.co/spaces/Xenova/fruit-fly-simulation" target="_blank" rel="noreferrer">На основе Xenova <ArrowUpRight size={14}/></a></footer>
    <details className="model-note"><summary>Как устроен эксперимент и что здесь условно</summary><div><p>Полный коннектом MaleCNS работает в импульсной LIF-модели Xenova. Пятнадцать лучей измеряют близость и тип объектов. LC9 получает постоянный искусственный фон 180 Гц с каждой стороны. LC10a получает сигнал видимого светящегося объекта, LC16 — близости и приближения преград, LC4 — изменения близости опасной поверхности; при неизменном сигнале стимул затухает с постоянной времени 250 мс. Признаки кодируются на стороне, где виден объект; готовая команда поворота в сенсорном режиме не подаётся. Отображение этих признаков на типы клеток экспериментальное, полноценная модель зрения отсутствует.</p><p>По умолчанию сенсорные входы и моторные выходы не пересекаются. Прямые входы DNp09, DNa02 и MDN доступны отдельно как контрольный режим. В нём контакт вперёд даёт импульс MDN до 300 мс, контакт назад его прерывает. Это заданный разработчиком интерфейс, а не обнаруженное природное поведение. Скорость и поворот считываются только из рассчитанных спайков нисходящих нейронов. Для поворота учитывается и малая разность активности сторон, без отсечения ниже 15 Гц. Поиск пути используется при генерации комнаты; муха не получает маршрут или карту. DNp01 повышает скорость на земле: полёт и мышцы не моделируются.</p><p>Геометрия, датчики, коэффициенты движения и связь с нейронами условны. Модель не обучается во время опыта и не гарантирует решение лабиринта. В этой модели LC16 слабо активирует MDN; надёжный обход препятствий не установлен, поэтому муха может застревать. Отключение обратной связи сохраняет только фоновый зрительный вход; это не автономная активность мозга. Модельное время замедляется, если устройство не успевает считать. CPU повторяет опыт по seed; GPU использует фиксированный нейронный seed исходной реализации.</p><a href="/neural/sensory-validation.json" target="_blank">Проверка на CPU ↗</a> · <a href="/neural/gpu-validation.json" target="_blank">Проверка WebGPU ↗</a> · <a href="/neural/model.json" target="_blank">Параметры исходной модели ↗</a> · <a href="/neural/UPSTREAM-LICENSE" target="_blank">Лицензии и авторство ↗</a></div></details>
  </main>;
}
