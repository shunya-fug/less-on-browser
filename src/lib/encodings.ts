import { groupBy } from 'es-toolkit';
import { EncodingInfoSchema, type EncodingInfo } from './schemas/encodings.js';

// TextDecoderがサポートするエンコーディング一覧
export const SUPPORTED_ENCODINGS: EncodingInfo[] = [
  // Unicode
  { value: 'utf-8', label: 'UTF-8', group: 'Unicode' },
  { value: 'utf-16le', label: 'UTF-16 Little Endian', group: 'Unicode' },
  { value: 'utf-16be', label: 'UTF-16 Big Endian', group: 'Unicode' },
  
  // 日本語
  { value: 'shift_jis', label: 'Shift_JIS', group: '日本語' },
  { value: 'euc-jp', label: 'EUC-JP', group: '日本語' },
  { value: 'iso-2022-jp', label: 'ISO-2022-JP', group: '日本語' },
  
  // 西欧
  { value: 'windows-1252', label: 'Windows-1252', group: '西欧' },
  { value: 'iso-8859-1', label: 'ISO-8859-1 (Latin-1)', group: '西欧' },
  
  // 中国語
  { value: 'gb2312', label: 'GB2312', group: '中国語' },
  { value: 'gbk', label: 'GBK', group: '中国語' },
  { value: 'gb18030', label: 'GB18030', group: '中国語' },
  { value: 'big5', label: 'Big5', group: '中国語' },
  
  // 韓国語
  { value: 'euc-kr', label: 'EUC-KR', group: '韓国語' },
  { value: 'iso-2022-kr', label: 'ISO-2022-KR', group: '韓国語' },
  
  // ロシア語
  { value: 'windows-1251', label: 'Windows-1251', group: 'ロシア語' },
  { value: 'koi8-r', label: 'KOI8-R', group: 'ロシア語' },
  
  // その他
  { value: 'ascii', label: 'ASCII', group: 'その他' },
  { value: 'iso-8859-2', label: 'ISO-8859-2', group: 'その他' },
  { value: 'iso-8859-15', label: 'ISO-8859-15', group: 'その他' },
].map(encoding => EncodingInfoSchema.parse(encoding));

export const DEFAULT_ENCODING = 'utf-8';

// キャッシュされたエンコーディンググループ（es-toolkitのgroupByを使用）
export const ENCODING_GROUPS = new Map(
  Object.entries(groupBy(SUPPORTED_ENCODINGS, (encoding) => encoding.group))
);