/**
 * 로그인 / 가입.
 *
 * **게스트 플레이는 계속 열려 있다.** 로그인은 전적을 쌓고 닉네임을 고정할 뿐,
 * 친구가 방 코드로 바로 들어오는 흐름을 막지 않는다.
 */

import { useState } from 'react';
import type { Account } from '../game/useOnline.js';

type Tab = 'login' | 'register';

export function AccountPanel({
  account,
  error,
  onRegister,
  onLogIn,
  onLogOut,
}: {
  readonly account: Account | null;
  readonly error: string | null;
  readonly onRegister: (email: string, password: string, nickname: string) => void;
  readonly onLogIn: (email: string, password: string) => void;
  readonly onLogOut: () => void;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState('');

  if (account !== null) {
    return (
      <div className="account account--in">
        <span className="account__who">{account.nickname}</span>
        <button type="button" className="btn btn--ghost btn--tiny" onClick={onLogOut}>
          로그아웃
        </button>
      </div>
    );
  }

  if (!open) {
    return (
      <div className="account">
        <span className="account__who account__who--guest">게스트</span>
        <button
          type="button"
          className="btn btn--ghost btn--tiny"
          onClick={() => setOpen(true)}
        >
          로그인 / 가입
        </button>
      </div>
    );
  }

  const canSubmit =
    email.includes('@') &&
    password.length >= 8 &&
    (tab === 'login' || nickname.trim().length > 0);

  const submit = (): void => {
    if (!canSubmit) return;
    if (tab === 'login') onLogIn(email, password);
    else onRegister(email, password, nickname.trim());
    setPassword('');
  };

  return (
    <div className="panel account__form">
      <div className="chips">
        <button
          type="button"
          className={`chip ${tab === 'login' ? 'chip--on' : ''}`}
          onClick={() => setTab('login')}
        >
          로그인
        </button>
        <button
          type="button"
          className={`chip ${tab === 'register' ? 'chip--on' : ''}`}
          onClick={() => setTab('register')}
        >
          가입
        </button>
        <button type="button" className="btn btn--ghost btn--tiny" onClick={() => setOpen(false)}>
          닫기
        </button>
      </div>

      <div className="panel__row">
        <input
          className="input"
          type="email"
          autoComplete="email"
          placeholder="이메일"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          className="input"
          type="password"
          autoComplete={tab === 'login' ? 'current-password' : 'new-password'}
          placeholder="비밀번호 (8자 이상)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
          }}
        />
        {tab === 'register' ? (
          <input
            className="input"
            placeholder="닉네임"
            maxLength={12}
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
          />
        ) : null}
      </div>

      {error !== null ? <div className="error">{error}</div> : null}

      <div className="panel__row">
        <button type="button" className="btn btn--primary" disabled={!canSubmit} onClick={submit}>
          {tab === 'login' ? '로그인' : '가입하기'}
        </button>
        <span className="panel__count">
          로그인하지 않아도 게스트로 바로 플레이할 수 있습니다.
        </span>
      </div>
    </div>
  );
}
