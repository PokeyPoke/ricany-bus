<script lang="ts">
  import { t, lang } from '../lib/i18n';
  /** the app's language, switched from the top bar: shows the language it switches to */
</script>

<button class="lang" lang={$lang === 'cs' ? 'en' : 'cs'} aria-label={$t('langToggle')} title={$t('langToggle')}
  onclick={() => lang.set($lang === 'cs' ? 'en' : 'cs')}>{$lang === 'cs' ? 'EN' : 'CZ'}</button>

<style>
  .lang { width: 48px; min-height: 48px; display: grid; place-items: center; border-radius: 14px; background: var(--chip); color: var(--fg); font-weight: 800; font-size: 0.95rem; letter-spacing: 0.02em; flex: none; }
</style>
