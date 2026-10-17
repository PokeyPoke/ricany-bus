<script lang="ts">
  import { formatHM, pragueNow } from '@rb/shared';
  import type { Itinerary } from '../router/types';
  import { leaveAt, secondsUntil } from '../lib/leave';
  import { t } from '../lib/i18n';

  let { it, boardDelay }: { it: Itinerary; boardDelay: (number | null)[] } = $props();
  const REMIND_SEC = 120;
  let clock = $state(pragueNow());
  $effect(() => { const i = setInterval(() => (clock = pragueNow()), 1000); return () => clearInterval(i); });

  const leave = $derived(leaveAt(it, boardDelay));
  const left = $derived(leave == null ? 0 : secondsUntil(it, leave, clock.date, clock.sec));
  const show = $derived(leave != null && left <= 2 * 3600 && left >= -10 * 60);

  const canNotify = typeof Notification !== 'undefined';
  let remind = $state(false);
  let fired = false;
  async function toggle() {
    if (remind) { remind = false; return; }
    if (canNotify && Notification.permission === 'default') await Notification.requestPermission().catch(() => {});
    remind = true;
    fired = left <= REMIND_SEC;
  }
  $effect(() => {
    if (!remind || fired || left > REMIND_SEC) return;
    fired = true;
    navigator.vibrate?.([200, 100, 200]);
    if (canNotify && Notification.permission === 'granted') {
      const body = $t('leaveNow');
      navigator.serviceWorker?.ready.then((r) => r.showNotification('Říčany zdarma', { body, tag: 'leave' })).catch(() => new Notification('Říčany zdarma', { body }));
    }
  });
</script>

{#if show}
  <div class="leave" role="timer" aria-live="polite">
    <span class="msg">
      {#if left > 60}⏱ {$t('leaveIn', { n: Math.ceil(left / 60), time: formatHM(leave ?? 0) })}
      {:else if left >= -30}🏃 {$t('leaveNow')}
      {:else}{$t('leaveMissed', { n: Math.round(-left / 60) || 1 })}{/if}
    </span>
    {#if left > REMIND_SEC}
      <button class="secondary remind" aria-pressed={remind} onclick={toggle}>🔔 {remind ? $t('remindOn') : $t('remindMe')}</button>
    {/if}
  </div>
  {#if remind && left > REMIND_SEC}<p class="small muted">{$t('remindHint')}</p>{/if}
{/if}

<style>
  .leave { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin: 6px 0; padding: 8px 10px; border-radius: 10px; background: var(--chip); }
  .msg { font-weight: 700; }
  .remind { white-space: nowrap; }
</style>
