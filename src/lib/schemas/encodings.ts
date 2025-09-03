import { z } from 'zod';

// サポートするエンコーディング値のスキーマ
export const EncodingValueSchema = z.enum([
  // Unicode
  'utf-8',
  'utf-16le',
  'utf-16be',
  
  // 日本語
  'shift_jis',
  'euc-jp',
  'iso-2022-jp',
  
  // 西欧
  'windows-1252',
  'iso-8859-1',
  
  // 中国語
  'gb2312',
  'gbk',
  'gb18030',
  'big5',
  
  // 韓国語
  'euc-kr',
  'iso-2022-kr',
  
  // ロシア語
  'windows-1251',
  'koi8-r',
  
  // その他
  'ascii',
  'iso-8859-2',
  'iso-8859-15',
]);

// エンコーディンググループのスキーマ
export const EncodingGroupSchema = z.enum([
  'Unicode',
  '日本語',
  '西欧',
  '中国語',
  '韓国語',
  'ロシア語',
  'その他',
]);

// エンコーディング情報のスキーマ
export const EncodingInfoSchema = z.object({
  value: EncodingValueSchema,
  label: z.string().min(1),
  group: EncodingGroupSchema,
});

// 検出結果の信頼度スキーマ
export const ConfidenceSchema = z.number().min(0).max(1);

// 検出方法のスキーマ
export const DetectionMethodSchema = z.enum(['BOM', 'statistical', 'default']);

// 検出結果のスキーマ
export const DetectionResultSchema = z.object({
  encoding: EncodingValueSchema,
  confidence: ConfidenceSchema,
  method: DetectionMethodSchema,
});

// 型エクスポート
export type EncodingValue = z.infer<typeof EncodingValueSchema>;
export type EncodingGroup = z.infer<typeof EncodingGroupSchema>;
export type EncodingInfo = z.infer<typeof EncodingInfoSchema>;
export type DetectionResult = z.infer<typeof DetectionResultSchema>;
export type DetectionMethod = z.infer<typeof DetectionMethodSchema>;