<script lang="ts">
  import { addDays, hmToSec, LINE_STYLE, pragueNow, secToHM } from '@rb/shared';
  import type { AppData } from '../lib/data';
  import type { PlaceRef } from '../router/types';
  import { route, navigate } from '../lib/nav';
  import { t, lang } from '../lib/i18n';
  import { now, pickTarget } from '../lib/ui';
  import PlaceInput from '../components/PlaceInput.svelte';
  import Icon from '../components/Icon.svelte';
  import LangButton from '../components/LangButton.svelte';
  import { sentenceOf, whenOf, withWhen, whenLabel, setFrom, setTo, clearTo, clearLine, swap, fromPlace, toPlace, type When } from './sentence';

  let { data }: { data: AppData } = $props();

  const s = $derived(sentenceOf($route, data, { me: $t('myLocation'), bus: $t('sBus'), bike: $t('sBike'), about: $t('about') }));
  const w = $derived(whenOf($route));
  const wLabel = $derived(whenLabel(w, $now.date, addDays($now.date, 1), { now: $t('sNow'), arrive: $t('sArrive'), tomorrow: $t('tomorrow') }, $lang));
  const lineColor = $derived(s.line ? Object.values(LINE_STYLE).find((x) => x.number === s.line)?.color ?? 'var(--accent)' : '');

  /** the word being edited (its editor opens under the sentence) */
  let editing = $state<'from' | 'to' | 'when' | null>(null);
  // another screen (a map tap, a link in the panel) closes the editor; changing the time on this one does not
  const screen = $derived($route.name);
  $effect(() => { void screen; editing = null; });
  $effect(() => { if (!editing) pickTarget.set(null); });

  const go = (r: typeof $route) => { editing = null; navigate(r, false, true); };
  const my = () => $t('myLocation');
  const pickFrom = (p: PlaceRef) => go(setFrom($route, data, p, my()));
  const pickTo = (p: PlaceRef) => go(setTo($route, data, p));

  // when: now, depart at, arrive by, with quick choices
  const hhmm = (t: string) => t.padStart(5, '0'); // <input type="time"> needs "07:30"
  const isoDate = (d: string) => `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
  const setWhen = (x: When) => navigate(withWhen($route, x), true, true);
  function setKind(kind: When['kind']) {
    if (kind === 'now') return setWhen({ kind: 'now' });
    const n = pragueNow();
    setWhen({ kind, date: w.kind === 'now' ? n.date : w.date, time: w.kind === 'now' || !w.time ? secToHM(n.sec) : w.time });
  }
  function quick(date: string, time: string) { setWhen({ kind: w.kind === 'arr' ? 'arr' : 'dep', date, time }); }
  function plusHour() {
    const n = pragueNow();
    const base = w.kind === 'now' || !w.time ? n.sec : hmToSec(w.time);
    const date = w.kind === 'now' ? n.date : w.date;
    const total = base + 3600;
    quick(total >= 86400 ? addDays(date, 1) : date, secToHM(total % 86400));
  }
  const canSwap = $derived(!!toPlace($route, data) && !!fromPlace($route, data));
</script>

<header class="sentence">
  <div class="words">
    {#if s.kind === 'detail'}
      <!-- a detail (bus, Nextbike, About) has its own back button in the panel: the bar just names it -->
      <span class="detail-title">{s.detail}</span>
    {:else}
      {#if s.line}
        <span class="word line" style:background={lineColor}>{$t('sLine', { n: s.line })}<button class="x on-line" aria-label={$t('sClear')} onclick={() => go(clearLine($route, data, my()))}><Icon name="close" size={16} /></button></span>
      {/if}
      {#if s.kind !== 'line'}
        <span class="glue">{$t('sFrom')}</span>
        <button class="word" class:open={editing === 'from'} aria-expanded={editing === 'from'} onclick={() => (editing = editing === 'from' ? null : 'from')}>{s.from?.label}</button>
        <span class="glue">{$t('sTo')}</span>
        {#if s.to}
          <span class="word-wrap">
            <button class="word" class:open={editing === 'to'} aria-expanded={editing === 'to'} onclick={() => (editing = editing === 'to' ? null : 'to')}>{s.to.label}</button>
            <button class="x" aria-label={$t('sClear')} onclick={() => go(clearTo($route, data, my()))}><Icon name="close" size={16} /></button>
          </span>
        {:else}
          <button class="word empty" class:open={editing === 'to'} aria-expanded={editing === 'to'} onclick={() => (editing = editing === 'to' ? null : 'to')}>{$t('sWhere')}</button>
        {/if}
      {/if}
      <span class="glue">·</span>
      <button class="word" class:open={editing === 'when'} aria-expanded={editing === 'when'} onclick={() => (editing = editing === 'when' ? null : 'when')}>{wLabel}</button>
    {/if}
  </div>
  <LangButton />
  <button class="icon" aria-label={$t('about')} onclick={() => navigate({ name: 'about' })}><Icon name="info" size={22} /></button>
</header>

{#if editing === 'from' || editing === 'to'}
  <div class="editor">
    {#key editing}
      <PlaceInput label={editing === 'from' ? $t('sEditFrom') : $t('sEditTo')} value={undefined} stops={data.stops} target={editing}
        onChange={(p) => (editing === 'from' ? pickFrom(p) : pickTo(p))} />
    {/key}
    <div class="row-btns">
      {#if canSwap}<button class="secondary" onclick={() => go(swap($route, data))}><Icon name="swap" size={18} /> {$t('swap')}</button>{/if}
      <button class="secondary" onclick={() => (editing = null)}>{$t('done')}</button>
    </div>
  </div>
{:else if editing === 'when'}
  <div class="editor">
    <div class="seg" role="group" aria-label={$t('sEditWhen')}>
      <button aria-pressed={w.kind === 'now'} onclick={() => setKind('now')}>{$t('departNow')}</button>
      <button aria-pressed={w.kind === 'dep'} onclick={() => setKind('dep')}>{$t('departAt')}</button>
      <button aria-pressed={w.kind === 'arr'} disabled={s.kind !== 'trip'} onclick={() => setKind('arr')}>{$t('arriveBy')}</button>
    </div>
    <div class="chips">
      <button class="chip" onclick={plusHour}>{$t('sPlusHour')}</button>
      <button class="chip" onclick={() => quick($now.date, '18:00')}>{$t('sTonight')}</button>
      <button class="chip" onclick={() => quick(addDays($now.date, 1), '7:30')}>{$t('sTomorrowMorning')}</button>
    </div>
    {#if w.kind !== 'now'}
      <div class="when">
        <input type="date" aria-label={$t('sEditWhen')} value={isoDate(w.date)} min={isoDate($now.date)} max={isoDate(data.meta.feedEnd)}
          onchange={(e) => setWhen({ ...w, date: e.currentTarget.value.replaceAll('-', '') })} />
        <input type="time" aria-label={$t('sEditWhen')} value={hhmm(w.time || '8:00')} onchange={(e) => setWhen({ ...w, time: e.currentTarget.value })} />
      </div>
    {/if}
    <div class="row-btns"><button class="primary" onclick={() => (editing = null)}>{$t('done')}</button></div>
  </div>
{/if}

<style>
  .sentence { display: flex; gap: 8px; align-items: flex-start; padding: 8px 12px; padding-top: max(8px, env(safe-area-inset-top)); background: var(--bg); box-shadow: var(--shadow); z-index: 10; }
  .words { flex: 1; min-width: 0; display: flex; flex-wrap: wrap; align-items: center; gap: 4px 6px; font-size: 1.05rem; min-height: 48px; }
  .glue { color: var(--muted); }
  .word { min-height: 40px; padding: 0 12px; border-radius: 12px; background: var(--chip); color: var(--accent); font-weight: 800; display: inline-flex; align-items: center; gap: 6px; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .word.empty { color: var(--muted); font-weight: 700; border: 2px dashed var(--line); background: transparent; }
  .word.open { outline: 2px solid var(--accent); }
  .detail-title { font-weight: 800; padding: 0 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
  .word.line { color: #fff; padding-right: 2px; }
  .word-wrap { display: inline-flex; align-items: center; }
  .x { width: 32px; min-height: 40px; display: grid; place-items: center; color: var(--muted); }
  .x.on-line { color: #fff; }
  .icon { width: 48px; height: 48px; display: grid; place-items: center; border-radius: 14px; background: var(--chip); color: var(--fg); flex: none; }
  .editor { background: var(--bg); padding: 4px 12px 12px; box-shadow: var(--shadow); z-index: 9; display: grid; gap: 10px; }
  .row-btns { display: flex; gap: 8px; justify-content: flex-end; }
  .when { display: flex; gap: 8px; }
  .when input { flex: 1; }
  .chips { display: flex; gap: 6px; flex-wrap: wrap; }
</style>
