export function PlaceholderScreen(props: { title: string }) {
  return (
    <section className="screen-grid">
      <div>
        <h1>{props.title}</h1>
        <p>This route is scaffolded for the Local SEO platform MVP path.</p>
      </div>
    </section>
  );
}

