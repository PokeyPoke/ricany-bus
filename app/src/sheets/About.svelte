<script lang="ts">
  import type { AppData } from '../lib/data';
  import { navigate } from '../lib/nav';
  import { t, lang } from '../lib/i18n';
  import Icon from '../components/Icon.svelte';
  import { tripOverlay, highlightLine, planMarkers } from '../lib/ui';

  let { data }: { data: AppData } = $props();
  const V2 = document.body.classList.contains('v2');
  $effect(() => { tripOverlay.set(null); highlightLine.set(null); planMarkers.set({}); });

  /** YYYYMMDD or ISO timestamp -> "d. m. yyyy" */
  const fmt = (s: string) => {
    const m = /^(\d{4})-?(\d{2})-?(\d{2})/.exec(s);
    return m ? `${+m[3]}. ${+m[2]}. ${m[1]}` : s;
  };
</script>

<div class="sheet-header">
  <button class="back" aria-label={$t('back')} onclick={() => (history.length > 1 ? history.back() : navigate({ name: 'home' }))}><Icon name="back" /></button>
  <h1>{$t('about')}</h1>
</div>

<div class="seg lang" role="group" aria-label={$t('language')}>
  <button aria-pressed={$lang === 'cs'} onclick={() => lang.set('cs')}>Čeština</button>
  <button aria-pressed={$lang === 'en'} onclick={() => lang.set('en')}>English</button>
</div>

<div class="about">
  <p>{$t('aboutIntro')}</p>
  <p><Icon name="access" /> {$t('aboutAccess')}</p>
  <p>{$t('aboutFree')} <a href="https://www.ricany.cz" target="_blank" rel="noopener">ricany.cz</a>.</p>
  <p>{$t('aboutData')}</p>
  <p>{$t('aboutUnofficial')}</p>
  <p class="muted">{$t('aboutValid', { from: fmt(data.meta.feedStart), to: fmt(data.meta.feedEnd), generated: fmt(data.meta.generatedAt) })}</p>
  <p><a class="src" href={V2 ? import.meta.env.BASE_URL : `${import.meta.env.BASE_URL}v2/`}>{V2 ? $t('classicVersion') : $t('tryNewVersion')}</a></p>
  <p><a class="src" href="https://github.com/PokeyPoke/ricany-bus" target="_blank" rel="noopener">{$t('aboutSource')}</a></p>
</div>

<style>
  .lang { margin: 4px 0 8px; }
  .about p { line-height: 1.5; }
  .about a { color: var(--accent); }
  .src { display: inline-flex; align-items: center; min-height: 44px; }
</style>
