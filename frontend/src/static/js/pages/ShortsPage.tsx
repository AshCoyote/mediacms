import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiUrlConfig, linksConfig } from '../utils/contexts/';
import { useUser } from '../utils/hooks/';
import { csrfToken, formatViewsNumber, translateString } from '../utils/helpers/';
import { MaterialIcon } from '../components/_shared/';
import { Page } from './Page';

interface ShortMedia {
  friendly_token: string;
  url: string;
  title: string;
  author_name: string;
  author_profile: string;
  author_thumbnail: string;
  thumbnail_url?: string;
  preview_url?: string;
  likes: number;
  views: number;
  media_type: string;
}

interface ShortComment {
  uid: string;
  text: string;
  add_date: string;
  author_name: string;
  author_thumbnail_url: string;
  author_profile: string;
}

const RESOLUTION_ORDER = ['1080', '720', '480', '360', '240', '144', '0-original'];

// The list API only carries the short preview clip; the media detail carries the
// encodings, so the feed asks for one media at a time when its slide becomes active.
function pickVideoUrl(detail: any): string | null {
  if (!detail) {
    return null;
  }

  const encodings = detail.encodings_info || {};
  const resolutions = Object.keys(encodings).sort(
    (a, b) => RESOLUTION_ORDER.indexOf(a) - RESOLUTION_ORDER.indexOf(b)
  );

  for (let i = 0; i < resolutions.length; i += 1) {
    const codecs = encodings[resolutions[i]] || {};
    const codec = codecs.h264 || codecs.h265 || codecs.vp9;
    if (codec && 'success' === codec.status && codec.url) {
      return codec.url;
    }
  }

  return detail.preview_url || null;
}

function ShortComments({ token, apiUrl }: { token: string; apiUrl: any }) {
  const { isAnonymous, userCan } = useUser();
  const [comments, setComments] = useState<ShortComment[]>([]);
  const [pending, setPending] = useState(true);
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    fetch(apiUrl.comments + '/' + token, { headers: { Accept: 'application/json' } })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!cancelled) {
          setComments((data && data.results) || []);
          setPending(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPending(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [token, apiUrl.comments]);

  function submitComment(ev: React.FormEvent) {
    ev.preventDefault();
    const trimmed = text.trim();
    if ('' === trimmed || submitting) {
      return;
    }

    setSubmitting(true);
    fetch(apiUrl.comments + '/' + token, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-CSRFToken': csrfToken() || '',
      },
      body: JSON.stringify({ text: trimmed }),
    })
      .then((response) => (response.ok || 201 === response.status ? response.json() : null))
      .then((comment) => {
        if (comment) {
          setComments((current) => [comment, ...current]);
          setText('');
        }
        setSubmitting(false);
      })
      .catch(() => setSubmitting(false));
  }

  return (
    <div className="shorts-comments">
      <h4>{translateString('Comments')}</h4>
      {userCan.addComment && !isAnonymous ? (
        <form onSubmit={submitComment} className="shorts-comment-form">
          <input
            type="text"
            value={text}
            placeholder={translateString('Add a comment...')}
            onChange={(ev) => setText(ev.target.value)}
            maxLength={1000}
          />
          <button type="submit" disabled={submitting || '' === text.trim()}>
            {translateString('Post')}
          </button>
        </form>
      ) : null}
      <div className="shorts-comments-list">
        {pending ? (
          <p className="shorts-comments-empty">{translateString('Loading comments...')}</p>
        ) : !comments.length ? (
          <p className="shorts-comments-empty">{translateString('No comments yet')}</p>
        ) : (
          comments.map((comment) => (
            <div className="shorts-comment" key={comment.uid}>
              <a href={comment.author_profile}>
                <img src={comment.author_thumbnail_url} alt={comment.author_name} />
              </a>
              <div>
                <a href={comment.author_profile} className="shorts-comment-author">
                  {comment.author_name}
                </a>
                <p>{comment.text}</p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

interface ShortSlideProps {
  media: ShortMedia;
  apiUrl: any;
  active: boolean;
  onActivate: () => void;
}

function ShortSlide({ media, apiUrl, active, onActivate }: ShortSlideProps) {
  const { isAnonymous } = useUser();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [muted, setMuted] = useState(true);
  const [likes, setLikes] = useState(media.likes);
  const [liked, setLiked] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);

  useEffect(() => {
    if (!active || src) {
      return;
    }

    let cancelled = false;

    fetch(apiUrl.media + '/' + media.friendly_token + '/', { headers: { Accept: 'application/json' } })
      .then((response) => (response.ok ? response.json() : null))
      .then((detail) => {
        if (!cancelled) {
          setSrc(pickVideoUrl(detail) || media.preview_url || null);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSrc(media.preview_url || null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [active, src, media.friendly_token, media.preview_url, apiUrl.media]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }
    if (active) {
      const playing = video.play();
      if (playing && 'function' === typeof playing.catch) {
        playing.catch(() => {});
      }
    } else {
      video.pause();
      video.currentTime = 0;
    }
  }, [active, src]);

  function toggleLike(ev: React.MouseEvent) {
    ev.preventDefault();
    ev.stopPropagation();

    if (isAnonymous) {
      window.location.href = linksConfig.signin;
      return;
    }

    if (liked) {
      return;
    }

    setLiked(true);
    setLikes((count) => count + 1);

    fetch(apiUrl.media + '/' + media.friendly_token + '/actions', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-CSRFToken': csrfToken() || '',
      },
      body: JSON.stringify({ type: 'like' }),
    }).catch(() => {
      setLiked(false);
      setLikes((count) => count - 1);
    });
  }

  return (
    <div className={'shorts-slide' + (active ? ' active' : '')}>
      <div className="shorts-video-wrap">
        {src ? (
          <video ref={videoRef} src={src} poster={media.thumbnail_url} loop playsInline muted={muted} preload="none" />
        ) : (
          <img src={media.thumbnail_url} alt={media.title} className="shorts-poster" />
        )}
      </div>

      <button type="button" className="shorts-sound-toggle" onClick={() => setMuted((value) => !value)}>
        <MaterialIcon type={muted ? 'volume_off' : 'volume_up'} />
      </button>

      <div className="shorts-actions">
        <a href={media.author_profile} className="shorts-author" title={media.author_name}>
          <img src={media.author_thumbnail} alt={media.author_name} />
        </a>
        <button type="button" className={'shorts-action' + (liked ? ' active' : '')} onClick={toggleLike}>
          <MaterialIcon type="thumb_up" />
          <span>{formatViewsNumber(likes, false)}</span>
        </button>
        <button type="button" className="shorts-action" onClick={() => setCommentsOpen(true)}>
          <MaterialIcon type="chat_bubble" />
          <span>{translateString('Comments')}</span>
        </button>
        <a href={media.url} className="shorts-action" title={translateString('Open')}>
          <MaterialIcon type="open_in_new" />
        </a>
      </div>

      <div className="shorts-caption">
        <a href={media.author_profile} className="shorts-caption-author">
          {media.author_name}
        </a>
        <p>{media.title}</p>
        <span className="shorts-views">
          {formatViewsNumber(media.views, false)} {translateString('views')}
        </span>
      </div>

      {!active ? (
        <button type="button" className="shorts-slide-overlay" onClick={onActivate} aria-label={translateString('Play')}>
          <MaterialIcon type="play_arrow" />
        </button>
      ) : null}

      {commentsOpen ? (
        <div className="shorts-comments-overlay" onClick={() => setCommentsOpen(false)}>
          <div className="shorts-comments-panel" onClick={(ev) => ev.stopPropagation()}>
            <button type="button" className="shorts-comments-close" onClick={() => setCommentsOpen(false)}>
              <MaterialIcon type="close" />
            </button>
            <ShortComments token={media.friendly_token} apiUrl={apiUrl} />
          </div>
        </div>
      ) : null}
    </div>
  );
}

export const ShortsPage: React.FC = () => {
  const apiUrl = useMemo(() => apiUrlConfig, []);
  const [items, setItems] = useState<ShortMedia[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [pending, setPending] = useState(true);
  const [activeIndex, setActiveIndex] = useState(0);
  const feedRef = useRef<HTMLDivElement>(null);
  const slidesRef = useRef<Map<number, HTMLDivElement>>(new Map());

  const requestUrl = useCallback((pageNumber: number) => apiUrl.media + '?media_format=short&page=' + pageNumber, [apiUrl.media]);

  useEffect(() => {
    let cancelled = false;

    fetch(requestUrl(1), { headers: { Accept: 'application/json' } })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (cancelled) {
          return;
        }
        const results = (data && data.results) || [];
        setItems(results);
        setHasMore(Boolean(data && data.next));
        setPending(false);
      })
      .catch(() => {
        if (!cancelled) {
          setPending(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [requestUrl]);

  const loadMore = useCallback(() => {
    if (!hasMore || pending) {
      return;
    }
    const nextPage = page + 1;
    setPending(true);
    fetch(requestUrl(nextPage), { headers: { Accept: 'application/json' } })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        setItems((current) => current.concat((data && data.results) || []));
        setHasMore(Boolean(data && data.next));
        setPage(nextPage);
        setPending(false);
      })
      .catch(() => setPending(false));
  }, [hasMore, pending, page, requestUrl]);

  useEffect(() => {
    if (!items.length || 'undefined' === typeof IntersectionObserver) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (0.6 <= entry.intersectionRatio) {
            const index = Number((entry.target as HTMLElement).dataset.slideIndex);
            if (!Number.isNaN(index)) {
              setActiveIndex(index);
            }
          }
        });
      },
      { root: feedRef.current, threshold: [0.6] }
    );

    slidesRef.current.forEach((element) => observer.observe(element));

    return () => observer.disconnect();
  }, [items]);

  function onScroll() {
    const feed = feedRef.current;
    if (!feed) {
      return;
    }
    if (feed.scrollTop + feed.clientHeight >= feed.scrollHeight - feed.clientHeight * 1.5) {
      loadMore();
    }
  }

  return (
    <Page id="shorts">
      <div className="shorts-feed" ref={feedRef} onScroll={onScroll}>
        {!items.length ? (
          <div className="shorts-empty">
            {pending ? translateString('Loading...') : translateString('No shorts yet')}
          </div>
        ) : (
          items.map((media, index) => (
            <div
              key={media.friendly_token}
              className="shorts-slide-wrap"
              data-slide-index={index}
              ref={(element) => {
                if (element) {
                  slidesRef.current.set(index, element);
                } else {
                  slidesRef.current.delete(index);
                }
              }}
            >
              <ShortSlide
                media={media}
                apiUrl={apiUrl}
                active={index === activeIndex}
                onActivate={() => setActiveIndex(index)}
              />
            </div>
          ))
        )}
      </div>
    </Page>
  );
};
