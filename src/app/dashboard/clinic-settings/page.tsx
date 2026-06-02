import { redirect } from 'next/navigation';

// 背景情報プロファイル機能は admin 配下へ移設（v13）。
// 旧ブックマーク・内部リンク救済のため新URLへリダイレクトする。
export default function ClinicSettingsRedirect() {
  redirect('/admin/clinic-settings');
}
