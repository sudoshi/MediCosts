import { Link } from 'react-router-dom';
import BlogLayout from '../components/BlogLayout';
import { BLOG_POSTS } from '../data/blogPosts';
import { useApi } from '../hooks/useApi.js';
import s from './BlogIndex.module.css';

export default function BlogIndex() {
  const { data: dailyPosts, loading } = useApi('/blog?limit=50', []);

  const pinnedPosts = (dailyPosts || []).filter((p) => p.is_pinned);
  const regularPosts = (dailyPosts || []).filter((p) => !p.is_pinned);

  return (
    <BlogLayout>
      <div className={s.hero}>
        <div className={s.eyebrow}>From the MediCosts Team</div>
        <h1 className={s.title}>Blog</h1>
        <p className={s.sub}>
          Investigations, engineering deep-dives, and policy analysis on healthcare
          cost transparency in America.
        </p>
      </div>

      <div className={s.grid}>
        {/* Static editorial posts */}
        {BLOG_POSTS.map((post) => (
          <article key={post.slug} className={s.card}>
            <div className={s.cardMeta}>
              {post.tags.map((t) => (
                <span key={t} className={s.tag}>{t}</span>
              ))}
            </div>
            <h2 className={s.cardTitle}>
              <Link to={`/blog/${post.slug}`} className={s.cardTitleLink}>
                {post.title}
              </Link>
            </h2>
            <p className={s.cardExcerpt}>{post.excerpt}</p>
            <div className={s.cardFooter}>
              <span className={s.cardByline}>{post.byline}</span>
              <span className={s.cardSep}>&middot;</span>
              <span className={s.cardDate}>{post.date}</span>
              <span className={s.cardSep}>&middot;</span>
              <span className={s.cardRead}>{post.readTime}</span>
              <Link to={`/blog/${post.slug}`} className={s.readLink}>
                Read article &rarr;
              </Link>
            </div>
          </article>
        ))}

        {/* Pinned daily posts */}
        {pinnedPosts.map((post) => (
          <article key={post.slug} className={`${s.card} ${s.pinnedCard}`}>
            <div className={s.cardMeta}>
              <span className={s.pinnedBadge}>Pinned</span>
              {(post.tags || []).map((t) => (
                <span key={t} className={s.tag}>{t}</span>
              ))}
            </div>
            <h2 className={s.cardTitle}>
              <Link to={`/blog/${post.slug}`} className={s.cardTitleLink}>
                {post.title}
              </Link>
            </h2>
            <p className={s.cardExcerpt}>{post.summary}</p>
            <div className={s.cardFooter}>
              <span className={s.cardByline}>ClearNetwork Crawler</span>
              <span className={s.cardSep}>&middot;</span>
              <span className={s.cardDate}>
                {new Date(post.published_at).toLocaleDateString('en-US', {
                  year: 'numeric', month: 'short', day: 'numeric',
                })}
              </span>
              <Link to={`/blog/${post.slug}`} className={s.readLink}>
                Read report &rarr;
              </Link>
            </div>
          </article>
        ))}

        {/* Section header for daily reports */}
        {regularPosts.length > 0 && (
          <div className={s.sectionHeader}>
            <h3 className={s.sectionTitle}>Daily Transparency Reports</h3>
            <p className={s.sectionSub}>
              Auto-generated every morning from our nightly crawl of {regularPosts[0]?.stats?.unique_insurers || '300+'} health insurers.
            </p>
          </div>
        )}

        {loading && <div className={s.loading}>Loading reports...</div>}

        {/* Regular daily posts */}
        {regularPosts.map((post) => (
          <article key={post.slug} className={s.card}>
            <div className={s.cardMeta}>
              {(post.tags || []).map((t) => (
                <span key={t} className={s.tag}>{t}</span>
              ))}
            </div>
            <h2 className={s.cardTitle}>
              <Link to={`/blog/${post.slug}`} className={s.cardTitleLink}>
                {post.title}
              </Link>
            </h2>
            <p className={s.cardExcerpt}>{post.summary}</p>
            <div className={s.cardFooter}>
              <span className={s.cardByline}>ClearNetwork Crawler</span>
              <span className={s.cardSep}>&middot;</span>
              <span className={s.cardDate}>
                {new Date(post.published_at).toLocaleDateString('en-US', {
                  year: 'numeric', month: 'short', day: 'numeric',
                })}
              </span>
              <Link to={`/blog/${post.slug}`} className={s.readLink}>
                Read report &rarr;
              </Link>
            </div>
          </article>
        ))}
      </div>
    </BlogLayout>
  );
}
