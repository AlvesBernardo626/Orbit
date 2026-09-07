import { test, expect, type Page } from '@playwright/test';
import type { AuthResult } from '@orbit/shared';
interface MediaFixture {
  connections: RTCPeerConnection[];
  sockets: WebSocket[];
  microphones: MediaStream[];
  screen: MediaStream | null;
}
declare global {
  interface Window {
    orbitTest: MediaFixture;
  }
}
async function prepare(page: Page) {
  await page.addInitScript(() => {
    const fixture: MediaFixture = { connections: [], sockets: [], microphones: [], screen: null };
    window.orbitTest = fixture;
    const Peer = window.RTCPeerConnection;
    window.RTCPeerConnection = class extends Peer {
      constructor(config?: RTCConfiguration) {
        super(config);
        fixture.connections.push(this);
      }
    };
    const Socket = window.WebSocket;
    window.WebSocket = class extends Socket {
      constructor(url: string | URL, protocols?: string | string[]) {
        super(url, protocols);
        fixture.sockets.push(this);
      }
    };
    // Synthetic audio/video exercise real codecs and RTP without reading private devices/screens.
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
      configurable: true,
      value: async () => {
        const context = new AudioContext();
        const oscillator = context.createOscillator();
        const destination = context.createMediaStreamDestination();
        oscillator.connect(destination);
        oscillator.start();
        await context.resume();
        const track = destination.stream.getAudioTracks()[0]!;
        const original = track.stop.bind(track);
        let stopped = false;
        track.stop = () => {
          if (stopped) return;
          stopped = true;
          original();
          oscillator.stop();
          void context.close();
        };
        fixture.microphones.push(destination.stream);
        return destination.stream;
      },
    });
    Object.defineProperty(navigator.mediaDevices, 'getDisplayMedia', {
      configurable: true,
      value: async () => {
        const canvas = document.createElement('canvas');
        canvas.width = 1280;
        canvas.height = 720;
        const ctx = canvas.getContext('2d')!;
        const timer = setInterval(() => {
          ctx.fillStyle = '#294c32';
          ctx.fillRect(0, 0, 1280, 720);
          ctx.fillStyle = '#c6ef96';
          ctx.font = '60px sans-serif';
          ctx.fillText(`Orbit test ${Date.now()}`, 50, 200);
        }, 80);
        const stream = canvas.captureStream(15);
        fixture.screen = stream;
        const track = stream.getVideoTracks()[0]!;
        const original = track.stop.bind(track);
        track.stop = () => {
          clearInterval(timer);
          original();
        };
        return stream;
      },
    });
  });
}
async function register(page: Page, username: string, name: string): Promise<AuthResult> {
  await prepare(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Criar conta', exact: true }).click();
  await page.getByLabel('Nome de exibição').fill(name);
  await page.getByLabel('Nome de usuário').fill(username);
  await page.getByLabel('Senha', { exact: true }).fill('test-only-strong-password');
  const response = page.waitForResponse((r) => r.url().endsWith('/api/auth/register'));
  await page.getByRole('button', { name: 'Criar minha conta' }).click();
  await expect(page.getByRole('button', { name: 'Adicionar amigo', exact: true })).toBeVisible();
  await expect(page.getByText('Tudo conectado', { exact: true })).toBeVisible();
  return (await response).json();
}
async function startShare(page: Page) {
  await page.getByRole('button', { name: 'Compartilhar tela', exact: true }).click();
  await page.getByRole('button', { name: 'Escolher tela ou janela', exact: true }).click();
}
async function receivedVideo(page: Page, count: number) {
  await expect
    .poll(() =>
      page
        .locator('video')
        .evaluateAll((els) => els.filter((el) => (el as HTMLVideoElement).videoWidth > 0).length),
    )
    .toBe(count);
}
async function receivedAudio(page: Page, count: number) {
  await expect
    .poll(() =>
      page.locator('audio').evaluateAll(
        (els) =>
          els.filter((el) => {
            const stream = (el as HTMLAudioElement).srcObject as MediaStream | null;
            return stream
              ?.getAudioTracks()
              .some((track) => track.readyState === 'live' && !track.muted);
          }).length,
      ),
    )
    .toBe(count);
}
async function cleanedUp(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.orbitTest.connections.every((p) => p.connectionState === 'closed') &&
          window.orbitTest.microphones.every((s) =>
            s.getTracks().every((t) => t.readyState === 'ended'),
          ) &&
          (!window.orbitTest.screen ||
            window.orbitTest.screen.getTracks().every((t) => t.readyState === 'ended')),
      ),
    )
    .toBe(true);
}
test('dois usuários: amizade, DM, voz e transmissão', async ({ browser, page }) => {
  const secondContext = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const second = await secondContext.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  second.on('pageerror', (e) => errors.push(e.message));
  await register(page, 'e2e_alice', 'Alice Teste');
  await register(second, 'e2e_bruno', 'Bruno Teste');
  await page.getByRole('button', { name: 'Adicionar amigo', exact: true }).click();
  await page.getByRole('dialog').getByLabel('Nome de usuário').fill('e2e_bruno');
  await page.getByRole('button', { name: 'Enviar solicitação' }).click();
  await second.getByRole('button', { name: /Pedidos/ }).click();
  await second.getByRole('button', { name: 'Aceitar', exact: true }).click();
  await second.getByRole('button', { name: /Todos/ }).click();
  await page.getByRole('button', { name: 'Conversar com Bruno Teste' }).click();
  await second.getByRole('button', { name: 'Conversar com Alice Teste' }).click();
  await page
    .getByRole('textbox', { name: 'Mensagem', exact: true })
    .fill('Olá, esta conversa está em tempo real.');
  await page.getByRole('button', { name: 'Enviar mensagem', exact: true }).click();
  await expect(
    second.getByText('Olá, esta conversa está em tempo real.', { exact: true }),
  ).toBeVisible();
  await page.locator('.message').hover();
  await page.getByRole('button', { name: 'Editar mensagem', exact: true }).click();
  await page
    .getByRole('textbox', { name: 'Mensagem', exact: true })
    .fill('Mensagem editada com sucesso.');
  await page.getByRole('button', { name: 'Salvar edição' }).click();
  await expect(second.getByText('Mensagem editada com sucesso.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Entrar na chamada', exact: true }).click();
  await expect(page.getByText('Vocês estão conectados', { exact: true })).toBeVisible();
  await second.getByRole('button', { name: 'Entrar na chamada', exact: true }).click();
  await expect(second.locator('.call-person')).toHaveCount(2);
  await receivedAudio(second, 1);
  await receivedAudio(page, 1);
  await page.getByRole('button', { name: 'Silenciar', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Ativar mic', exact: true })).toBeVisible();
  expect(
    await page.evaluate(() => window.orbitTest.microphones.at(-1)!.getAudioTracks()[0]!.enabled),
  ).toBe(false);
  await page.getByRole('button', { name: 'Ativar mic', exact: true }).click();
  await startShare(page);
  await expect(second.getByText('Alice Teste está transmitindo', { exact: true })).toBeVisible();
  await receivedVideo(second, 1);
  await page.screenshot({ path: 'test-results/orbit-call.png' });
  await page.getByRole('button', { name: 'Parar transmissão', exact: true }).click();
  await expect(second.locator('video')).toHaveCount(0);
  await page.getByRole('button', { name: 'Sair', exact: true }).click();
  await expect(page.locator('.call-panel')).toHaveCount(0);
  await expect(second.locator('.call-person')).toHaveCount(1);
  await second.getByRole('button', { name: 'Sair', exact: true }).click();
  await cleanedUp(page);
  await cleanedUp(second);
  await page.getByRole('button', { name: 'Criar grupo', exact: true }).click();
  await page.getByRole('dialog').getByLabel('Nome do grupo').fill('Nossa órbita');
  await page.getByRole('dialog').getByRole('checkbox').check();
  await page.getByRole('dialog').getByRole('button', { name: 'Criar grupo', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Nossa órbita', exact: true })).toBeVisible();
  await expect(
    second.locator('.conversation-link').filter({ hasText: 'Nossa órbita' }),
  ).toBeVisible();
  await page.screenshot({ path: 'test-results/orbit-workspace.png' });
  expect(errors).toEqual([]);
  await secondContext.close();
});
test('três participantes: entrada tardia, duas telas, fim da fonte e reconexão', async ({
  browser,
  page,
  request,
}) => {
  const contexts = await Promise.all([browser.newContext(), browser.newContext()]);
  const pages = [page, await contexts[0]!.newPage(), await contexts[1]!.newPage()];
  const names = ['trio_ana', 'trio_bia', 'trio_caio'];
  const auth: AuthResult[] = [];
  for (let i = 0; i < 3; i++)
    auth.push(await register(pages[i]!, names[i]!, ['Ana Teste', 'Bia Teste', 'Caio Teste'][i]!));
  const base = process.env.E2E_API_URL!;
  const headers = (i: number) => ({ Authorization: `Bearer ${auth[i]!.accessToken}` });
  for (let i = 1; i < 3; i++) {
    expect(
      (
        await request.post(`${base}/api/friends`, {
          headers: headers(0),
          data: { username: names[i] },
        })
      ).status(),
    ).toBe(204);
    const pending = await (
      await request.get(`${base}/api/friends`, { headers: headers(i) })
    ).json();
    expect(
      (
        await request.post(`${base}/api/friends/${pending[0].id}/accept`, { headers: headers(i) })
      ).status(),
    ).toBe(204);
  }
  const created = await request.post(`${base}/api/groups`, {
    headers: headers(0),
    data: { name: 'Trio de testes', members: auth.slice(1).map((a) => a.user.id) },
  });
  expect(created.status()).toBe(201);
  for (const client of pages)
    await client.locator('.conversation-link').filter({ hasText: 'Trio de testes' }).click();
  for (const client of pages.slice(0, 2)) {
    await client.getByRole('button', { name: 'Entrar na chamada', exact: true }).click();
    await expect(client.getByText('Vocês estão conectados', { exact: true })).toBeVisible();
  }
  await receivedAudio(page, 1);
  await startShare(page);
  await receivedVideo(pages[1]!, 1);
  await pages[2]!.getByRole('button', { name: 'Entrar na chamada', exact: true }).click();
  await receivedVideo(pages[2]!, 1);
  for (const client of pages) {
    await expect(client.locator('.call-person')).toHaveCount(3);
    await receivedAudio(client, 2);
  }
  await startShare(pages[1]!);
  await receivedVideo(pages[2]!, 2);
  await page.evaluate(() => {
    const track = window.orbitTest.screen!.getVideoTracks()[0]!;
    track.stop();
    track.dispatchEvent(new Event('ended'));
  });
  await expect(page.getByRole('button', { name: 'Compartilhar tela', exact: true })).toBeVisible();
  await expect(pages[2]!.locator('video')).toHaveCount(1);
  const connections = await pages[1]!.evaluate(() => window.orbitTest.connections.length);
  await pages[1]!.evaluate(() =>
    window.orbitTest.sockets
      .filter((s) => s.readyState === WebSocket.OPEN)
      .forEach((s) => s.close()),
  );
  await expect
    .poll(() => pages[1]!.evaluate(() => window.orbitTest.connections.length))
    .toBeGreaterThan(connections);
  await expect(pages[1]!.getByText('Vocês estão conectados', { exact: true })).toBeVisible();
  await receivedAudio(pages[1]!, 2);
  await receivedVideo(pages[2]!, 1);
  for (const client of pages) {
    await client.getByRole('button', { name: 'Sair', exact: true }).click();
    await cleanedUp(client);
  }
  for (const context of contexts) await context.close();
});
