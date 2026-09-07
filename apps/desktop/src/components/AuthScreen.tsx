import { useState, type FormEvent } from 'react';
import { ArrowUpRight, AudioLines, Monitor, Orbit } from 'lucide-react';
import { registerSchema, loginSchema } from '@orbit/shared';
import { signIn } from '../lib/api';
import { Field } from './ui';
export function AuthScreen() {
  const [register, setRegister] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    const form = new FormData(e.currentTarget);
    const raw = Object.fromEntries(form);
    const parsed = (register ? registerSchema : loginSchema).safeParse(raw);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Confira os campos');
      return;
    }
    setBusy(true);
    try {
      await signIn(register ? 'register' : 'login', parsed.data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-screen">
      <section className="auth-story">
        <div className="brand">
          <Orbit /> orbit<span>SEU PONTO DE ENCONTRO</span>
        </div>
        <div className="orbital-art">
          <i />
          <i />
          <i />
          <span>o.</span>
          <b className="planet p1" />
          <b className="planet p2" />
        </div>
        <div>
          <span className="eyebrow">MAIS PERTO, MESMO DE LONGE</span>
          <h1>
            O seu espaço.
            <br />A sua companhia.
          </h1>
          <p>
            Converse, compartilhe a tela e fique por perto.
            <br />
            As melhores coisas acontecem entre amigos.
          </p>
          <div className="feature-pills">
            <span>
              <AudioLines size={15} />
              Voz em tempo real
            </span>
            <span>
              <Monitor size={15} />
              Uma tela, muitas histórias
            </span>
          </div>
        </div>
        <small>Orbit · Feito para estar junto</small>
      </section>
      <section className="auth-form">
        <div>
          <span className="eyebrow">ENTRE NA SUA ÓRBITA</span>
          <h2>{register ? 'Encontre o seu lugar.' : 'Que bom ter você aqui.'}</h2>
          <p>
            {register ? 'Crie sua conta e chame os amigos.' : 'Entre para continuar a conversa.'}
          </p>
          <form onSubmit={submit}>
            {register && (
              <Field label="Nome de exibição">
                <input
                  name="displayName"
                  required
                  maxLength={48}
                  autoComplete="nickname"
                  placeholder="Como seus amigos te chamam"
                />
              </Field>
            )}
            <Field label="Nome de usuário">
              <input
                name="username"
                required
                minLength={3}
                maxLength={24}
                pattern="[a-zA-Z0-9_]{3,24}"
                autoComplete="username"
                placeholder="seu_usuario"
              />
            </Field>
            <Field label="Senha">
              <input
                name="password"
                type="password"
                required
                minLength={register ? 12 : 1}
                maxLength={72}
                autoComplete={register ? 'new-password' : 'current-password'}
                placeholder={register ? 'Pelo menos 12 caracteres' : 'Sua senha'}
              />
            </Field>
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
            <button className="primary" disabled={busy}>
              {busy ? 'Conectando…' : register ? 'Criar minha conta' : 'Entrar no Orbit'}
              <ArrowUpRight size={18} />
            </button>
          </form>
          <p className="switch-auth">
            {register ? 'Já tem uma conta?' : 'Ainda não faz parte?'}{' '}
            <button
              onClick={() => {
                setRegister(!register);
                setError('');
              }}
            >
              {register ? 'Entrar' : 'Criar conta'}
            </button>
          </p>
          <p className="muted small">
            Recuperação de senha ainda não disponível. Guarde sua senha em um gerenciador.
          </p>
        </div>
      </section>
    </div>
  );
}
