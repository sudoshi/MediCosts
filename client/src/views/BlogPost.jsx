import { lazy, Suspense } from 'react';
import { useParams, Link, Navigate } from 'react-router-dom';
import BlogLayout from '../components/BlogLayout';
import { getPost } from '../data/blogPosts';
import s from './BlogPost.module.css';

const CONTENT_MAP = {
  'healthcare-price-transparency': lazy(() =>
    import('./blog/HealthcarePriceTransparency')
  ),
};

function ArticleLoader() {
  return (
    <div className={s.loading}>
      <div className={s.loadingBar} />
    </div>
  );
}

export default function BlogPost() {
  const { slug } = useParams();
  const post = getPost(slug);

  if (!post) return <Navigate to="/blog" replace />;

  const ContentComponent = CONTENT_MAP[slug];

  return (
    <BlogLayout>
      {/* ── Masthead ── */}
      <div className={s.masthead}>
        {post.tags.join(' · ')}
      </div>

      {/* ── Hero ── */}
      <header className={s.hero}>
        <div className={s.kicker}>{post.kicker}</div>
        <h1 className={s.title}>{post.title}</h1>
        <p className={s.subtitle}>{post.subtitle}</p>
        <p className={s.byline}>
          <strong>{post.byline}</strong>
          <span className={s.bylineSep}>·</span>
          {post.date}
          <span className={s.bylineSep}>·</span>
          {post.readTime}
        </p>
      </header>

      {/* ── Article body ── */}
      <div className={s.articleWrap}>
        {ContentComponent ? (
          <Suspense fallback={<ArticleLoader />}>
            <ContentComponent />
          </Suspense>
        ) : (
          <p className={s.notFound}>Article content not found.</p>
        )}
      </div>

      {/* ── Article footer ── */}
      <div className={s.articleFooter}>
        <p>
          <strong>About this investigation.</strong> MediCosts is an ongoing project
          to aggregate and make accessible the pricing data published under the
          Transparency in Coverage Rule. The findings reported here are based on direct
          technical testing of insurer endpoints conducted between 2024 and 2025.
          Methodology details and raw accessibility data are available upon request.
        </p>
        <div className={s.backRow}>
          <Link to="/blog" className={s.backLink}>← All Posts</Link>
        </div>
      </div>
    </BlogLayout>
  );
}
