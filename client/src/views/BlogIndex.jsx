import { Link } from 'react-router-dom';
import BlogLayout from '../components/BlogLayout';
import { BLOG_POSTS } from '../data/blogPosts';
import s from './BlogIndex.module.css';

export default function BlogIndex() {
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
              <span className={s.cardSep}>·</span>
              <span className={s.cardDate}>{post.date}</span>
              <span className={s.cardSep}>·</span>
              <span className={s.cardRead}>{post.readTime}</span>
              <Link to={`/blog/${post.slug}`} className={s.readLink}>
                Read article →
              </Link>
            </div>
          </article>
        ))}
      </div>
    </BlogLayout>
  );
}
