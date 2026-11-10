<script>
  import { styles } from '../three/styles/index.js';
</script>

<main>
  <h1>Keringkam</h1>
  <ul>
    {#each styles as style (style.id)}
      <li>
        <a href={`#/${style.id}`}>
          <span class="name">{style.name}</span>
          <span class="description">{style.description}</span>
        </a>
      </li>
    {/each}
  </ul>
</main>

<style>
  main {
    box-sizing: border-box;
    min-height: 100vh;
    max-width: 640px;
    margin: 0 auto;
    padding: 64px 16px;
    color: #eee;
    font-family: Georgia, 'Times New Roman', serif;
  }
  h1 {
    font-weight: normal;
    font-size: 40px;
    letter-spacing: 0.04em;
    margin: 0 0 40px;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  li + li {
    border-top: 1px solid #2a2a2a;
  }
  a {
    display: block;
    padding: 20px 0;
    color: inherit;
    text-decoration: none;
  }
  .name {
    display: block;
    font-size: 22px;
  }
  .description {
    display: block;
    margin-top: 6px;
    color: #999;
    font-family: system-ui, sans-serif;
    font-size: 15px;
    line-height: 1.4;
  }
  a:hover .name,
  a:focus-visible .name {
    color: #d9b46a;
  }
</style>
