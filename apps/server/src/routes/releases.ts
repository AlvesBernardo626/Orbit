import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { Router } from 'express';
import { desktopReleaseRepository, env } from '../config/env.js';
import { AppError } from '../services/errors.js';

type ReleaseAsset = {
  id: number;
  name: string;
  size: number;
  browser_download_url: string;
  url: string;
};

type GithubRelease = {
  tag_name: string;
  name: string | null;
  published_at: string | null;
  html_url: string;
  assets: ReleaseAsset[];
};

type CachedRelease = { expiresAt: number; value: GithubRelease };
let cache: CachedRelease | undefined;

const githubHeaders = (accept: string) => ({
  Accept: accept,
  'User-Agent': 'Orbit-Release-Service',
  'X-GitHub-Api-Version': '2022-11-28',
  ...(env.GITHUB_RELEASE_TOKEN ? { Authorization: `Bearer ${env.GITHUB_RELEASE_TOKEN}` } : {}),
});

async function latestRelease() {
  if (!desktopReleaseRepository)
    throw new AppError(503, 'Repositório de releases do desktop não configurado');
  if (cache && cache.expiresAt > Date.now()) return cache.value;

  if (!env.GITHUB_RELEASE_TOKEN) {
    const latestUrl = `https://github.com/${desktopReleaseRepository}/releases/latest`;
    const response = await fetch(latestUrl, {
      headers: { Accept: 'text/html', 'User-Agent': 'Orbit-Release-Service' },
      redirect: 'manual',
      signal: AbortSignal.timeout(10000),
    });
    if (response.status === 404) throw new AppError(404, 'Nenhuma versão do Orbit foi publicada');
    const location = response.headers.get('location');
    if (![301, 302, 307, 308].includes(response.status) || !location)
      throw new AppError(502, 'Não foi possível localizar a versão publicada');
    const releasePage = new URL(location, latestUrl);
    const tagPrefix = `/${desktopReleaseRepository}/releases/tag/`;
    if (
      releasePage.protocol !== 'https:' ||
      releasePage.hostname !== 'github.com' ||
      !releasePage.pathname.toLowerCase().startsWith(tagPrefix.toLowerCase())
    )
      throw new AppError(502, 'Origem inválida para a versão publicada');
    const tag = decodeURIComponent(releasePage.pathname.slice(tagPrefix.length));
    const version = tag.replace(/^v/, '');
    if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version))
      throw new AppError(502, 'Versão publicada inválida');

    const names = [
      'latest.yml',
      'latest-mac.yml',
      ...['arm64', 'x64', 'universal'].flatMap((arch) =>
        ['dmg', 'zip'].flatMap((extension) => [
          `Orbit-${version}-${arch}.${extension}`,
          `Orbit-${version}-${arch}.${extension}.blockmap`,
        ]),
      ),
      `Orbit-Setup-${version}-x64.exe`,
      `Orbit-Setup-${version}-x64.exe.blockmap`,
      'SHA256SUMS.txt',
    ];
    const value: GithubRelease = {
      tag_name: tag,
      name: `Orbit ${version}`,
      published_at: null,
      html_url: releasePage.toString(),
      assets: names.map((name, id) => ({
        id,
        name,
        size: 0,
        browser_download_url: `https://github.com/${desktopReleaseRepository}/releases/download/${encodeURIComponent(tag)}/${encodeURIComponent(name)}`,
        url: '',
      })),
    };
    cache = { expiresAt: Date.now() + env.RELEASE_CACHE_SECONDS * 1000, value };
    return value;
  }

  const response = await fetch(
    `https://api.github.com/repos/${desktopReleaseRepository}/releases/latest`,
    {
      headers: githubHeaders('application/vnd.github+json'),
      signal: AbortSignal.timeout(10000),
    },
  );
  if (response.status === 404) throw new AppError(404, 'Nenhuma versão do Orbit foi publicada');
  if (!response.ok) throw new AppError(502, 'Não foi possível consultar a versão publicada');
  const value = (await response.json()) as GithubRelease;
  cache = { expiresAt: Date.now() + env.RELEASE_CACHE_SECONDS * 1000, value };
  return value;
}

function safeDownloadUrl(asset: ReleaseAsset) {
  const url = new URL(asset.browser_download_url);
  const prefix = `/${desktopReleaseRepository}/releases/download/`;
  if (
    url.protocol !== 'https:' ||
    url.hostname !== 'github.com' ||
    !url.pathname.toLowerCase().startsWith(prefix.toLowerCase())
  )
    throw new AppError(502, 'Origem inválida para o artefato publicado');
  return url.toString();
}

function safeAssetApiUrl(asset: ReleaseAsset) {
  const url = new URL(asset.url);
  const prefix = `/repos/${desktopReleaseRepository}/releases/assets/`;
  if (
    url.protocol !== 'https:' ||
    url.hostname !== 'api.github.com' ||
    !url.pathname.toLowerCase().startsWith(prefix.toLowerCase())
  )
    throw new AppError(502, 'Origem privada inválida para o artefato publicado');
  return url.toString();
}

const targetPatterns: Record<string, RegExp> = {
  'mac-arm64': /-arm64\.dmg$/i,
  'mac-x64': /-x64\.dmg$/i,
  'mac-universal': /-universal\.dmg$/i,
  windows: /-Setup-[^-]+-x64\.exe$/i,
};

export const releaseRoutes = Router();

releaseRoutes.get('/', async (req, res) => {
  const release = await latestRelease();
  const origin = `${req.protocol}://${req.get('host')}`;
  const downloads = Object.fromEntries(
    Object.entries(targetPatterns).flatMap(([target, pattern]) => {
      const asset = release.assets.find((candidate) => pattern.test(candidate.name));
      return asset ? [[target, `${origin}/downloads/${encodeURIComponent(asset.name)}`]] : [];
    }),
  );
  res.setHeader('Cache-Control', `public, max-age=${env.RELEASE_CACHE_SECONDS}`);
  res.json({
    version: release.tag_name.replace(/^v/, ''),
    name: release.name ?? release.tag_name,
    publishedAt: release.published_at,
    releasePage: release.html_url,
    downloads,
  });
});

releaseRoutes.get('/latest/:target', async (req, res) => {
  const pattern = targetPatterns[req.params.target];
  if (!pattern) throw new AppError(404, 'Plataforma de download inválida');
  const release = await latestRelease();
  const asset = release.assets.find((candidate) => pattern.test(candidate.name));
  if (!asset) throw new AppError(404, 'Instalador ainda não disponível para esta plataforma');
  res.redirect(307, `/downloads/${encodeURIComponent(asset.name)}`);
});

releaseRoutes.get('/:asset', async (req, res) => {
  const release = await latestRelease();
  const asset = release.assets.find((candidate) => candidate.name === req.params.asset);
  if (!asset || !/^[A-Za-z0-9._-]+$/.test(asset.name))
    throw new AppError(404, 'Arquivo não encontrado na versão atual');

  if (!env.GITHUB_RELEASE_TOKEN) {
    res.redirect(307, safeDownloadUrl(asset));
    return;
  }

  const headers = githubHeaders('application/octet-stream');
  const requestedRange = req.get('range');
  const upstream = await fetch(safeAssetApiUrl(asset), {
    headers: { ...headers, ...(requestedRange ? { Range: requestedRange } : {}) },
    redirect: 'follow',
    signal: AbortSignal.timeout(30000),
  });
  if (!upstream.ok && upstream.status !== 206)
    throw new AppError(502, 'Não foi possível baixar o artefato publicado');
  if (!upstream.body) throw new AppError(502, 'O provedor retornou um arquivo vazio');

  res.status(upstream.status);
  for (const header of [
    'accept-ranges',
    'content-length',
    'content-range',
    'content-type',
    'etag',
    'last-modified',
  ]) {
    const value = upstream.headers.get(header);
    if (value) res.setHeader(header, value);
  }
  res.setHeader('Content-Disposition', `attachment; filename="${asset.name}"`);
  res.setHeader('Cache-Control', 'private, no-cache');
  await pipeline(Readable.from(upstream.body as AsyncIterable<Uint8Array>), res);
});
