<script>
  import { styles } from '../three/styles/index.js';

  const studies = styles.filter((s) => s.group === 'studies');
  const earlier = styles.filter((s) => s.group === 'earlier');
</script>

<main>
  <header>
    <p class="kk-mono">Keringkam — {studies.length} studies</p>
    <h1 class="kk-wide">Keringkam</h1>
  </header>

  <ol>
    {#each studies as style, k (style.id)}
      <li>
        <a href={`#/${style.id}`}>
          <span class="num kk-mono">{String(k + 1).padStart(2, '0')}</span>
          <span class="name kk-wide">{style.name}</span>
          <span class="description">{style.description}</span>
          <span class="after kk-mono">After: {style.after}</span>
        </a>
      </li>
    {/each}
  </ol>

  <section>
    <h2 class="kk-mono">Earlier experiments</h2>
    <p class="earlier">
      {#each earlier as style, k (style.id)}
        <a href={`#/${style.id}`}>{style.name}</a>{k < earlier.length - 1 ? ' · ' : ''}
      {/each}
    </p>
  </section>
</main>

<style>
  main {
    box-sizing: border-box;
    min-height: 100vh;
    max-width: 920px;
    margin: 0 auto;
    padding: 56px 16px 80px;
    color: #eeeae4;
    font-family: var(--serif);
  }
  header p {
    color: var(--accent);
    margin: 0 0 12px;
  }
  h1 {
    font-size: clamp(40px, 10vw, 112px);
    margin: 0 0 48px;
  }
  ol {
    list-style: none;
    margin: 0;
    padding: 0;
    border-top: 1px solid #2c2a28;
  }
  li {
    border-bottom: 1px solid #2c2a28;
  }
  a {
    color: inherit;
    text-decoration: none;
  }
  li a {
    display: grid;
    grid-template-columns: 48px 1fr;
    gap: 6px 16px;
    padding: 22px 0;
  }
  .num {
    grid-row: span 3;
    color: #8a857e;
    padding-top: 8px;
  }
  .name {
    font-size: clamp(28px, 4.4vw, 48px);
    transition: color 200ms;
  }
  .description {
    font-size: 19px;
    line-height: 1.35;
    color: #c9c4bc;
    max-width: 62ch;
  }
  .after {
    color: #8a857e;
  }
  li a:hover .name,
  li a:focus-visible .name {
    color: var(--accent);
  }
  li a:focus-visible {
    outline: 1px solid var(--accent);
    outline-offset: 4px;
  }
  section {
    margin-top: 48px;
  }
  h2 {
    color: #8a857e;
    font-weight: 400;
    margin: 0 0 10px;
  }
  .earlier {
    font-size: 19px;
    margin: 0;
  }
  .earlier a {
    border-bottom: 1px solid #4a4642;
  }
  .earlier a:hover {
    color: var(--accent);
    border-color: var(--accent);
  }
</style>
