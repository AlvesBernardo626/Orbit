function microphonePermissionMessage(platform: string) {
  if (platform === 'darwin')
    return 'O Orbit não tem acesso ao seu microfone. Abra Ajustes do Sistema > Privacidade e Segurança > Microfone, habilite o Orbit e reinicie o aplicativo.';
  if (platform === 'win32')
    return 'O Orbit não tem acesso ao microfone. Abra Configurações > Privacidade e segurança > Microfone e permita o acesso para aplicativos da área de trabalho.';
  return 'O Orbit não tem acesso ao microfone. Verifique as permissões de áudio do sistema.';
}

export async function ensureMicrophoneAccess() {
  if (!window.orbit) return;
  let info = await window.orbit.capabilities();
  if (info.platform === 'darwin' && info.permissions.microphone === 'not-determined') {
    await window.orbit.requestMicrophonePermission();
    info = await window.orbit.capabilities();
  }
  if (['denied', 'restricted'].includes(info.permissions.microphone))
    throw new Error(microphonePermissionMessage(info.platform));
}
