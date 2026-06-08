'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Eye,
  Pencil,
  Trash2,
  Download,
  RefreshCw,
  BookmarkPlus,
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Link2,
} from 'lucide-react';

interface RecruitmentRecord {
  id: string;
  task_id?: string;
  company_name: string | null;
  company_type: string | null;
  recruitment_type: string | null;
  industry: string | null;
  theme: string | null;
  deadline: string | null;
  target_candidates: string | null;
  referral: string | null;
  locations: string | null;
  positions: string | null;
  requirements: string | null;
  application_url: string | null;
  source_url: string | null;
  source_type: string | null;
  confidence: number;
  field_sources: string | null;
  warnings: string | null;
  confirmed: boolean;
  created_at: string;
  updated_at?: string;
}

interface ImportForm {
  sourceUrl: string;
  title: string;
  accountName: string;
  publishTime: string;
  contentText: string;
  imageUrls: string;
}

export default function RecruitmentPanel() {
  const [records, setRecords] = useState<RecruitmentRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importMode, setImportMode] = useState<'manual' | 'bookmarklet'>('bookmarklet');
  const [importForm, setImportForm] = useState<ImportForm>({
    sourceUrl: '',
    title: '',
    accountName: '',
    publishTime: '',
    contentText: '',
    imageUrls: '',
  });
  const [editRecord, setEditRecord] = useState<RecruitmentRecord | null>(null);
  const [showBookmarkletGuide, setShowBookmarkletGuide] = useState(false);
  const [bookmarkletUrl, setBookmarkletUrl] = useState('');

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/recruitment-records');
      const data = await res.json();
      if (data.success) setRecords(data.data || []);
    } catch (e) {
      console.error('Failed to fetch records:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchRecords(); }, [fetchRecords]);

  // Fetch bookmarklet code
  useEffect(() => {
    fetch('/api/wechat/bookmarklet')
      .then(r => r.text())
      .then(code => { setBookmarkletUrl('javascript:' + encodeURIComponent(code)); })
      .catch(() => {});
  }, []);

  const handleManualImport = async () => {
    if (!importForm.contentText.trim() && !importForm.imageUrls.trim()) {
      alert('请输入正文内容或图片URL');
      return;
    }
    setImporting(true);
    try {
      const imageUrls = importForm.imageUrls
        .split('\n')
        .map(u => u.trim())
        .filter(u => u.length > 0);

      const res = await fetch('/api/wechat/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceUrl: importForm.sourceUrl || '',
          title: importForm.title || '',
          accountName: importForm.accountName || '',
          publishTime: importForm.publishTime || '',
          contentText: importForm.contentText || '',
          contentHtml: '',
          imageUrls,
          importMethod: 'manual',
          importedAt: new Date().toISOString(),
        }),
      });
      const data = await res.json();
      if (data.success) {
        const items = data.data?.items || [];
        alert(`识别完成！识别到 ${items.length} 条招聘信息`);
        setImportForm({ sourceUrl: '', title: '', accountName: '', publishTime: '', contentText: '', imageUrls: '' });
        fetchRecords();
      } else {
        alert('识别失败: ' + (data.error || '未知错误'));
      }
    } catch (e) {
      alert('导入失败: ' + (e instanceof Error ? e.message : '网络错误'));
    } finally {
      setImporting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定删除这条记录？')) return;
    try {
      await fetch(`/api/recruitment-records/${id}`, { method: 'DELETE' });
      setRecords(prev => prev.filter(r => r.id !== id));
    } catch (e) {
      console.error('Delete failed:', e);
    }
  };

  const handleConfirm = async (id: string) => {
    try {
      await fetch(`/api/recruitment-records/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmed: true }),
      });
      setRecords(prev => prev.map(r => r.id === id ? { ...r, confirmed: true } : r));
    } catch (e) {
      console.error('Confirm failed:', e);
    }
  };

  const handleEditSave = async () => {
    if (!editRecord) return;
    try {
      const { id, created_at, updated_at, ...updates } = editRecord;
      await fetch(`/api/recruitment-records/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      setRecords(prev => prev.map(r => r.id === id ? editRecord : r));
      setEditRecord(null);
    } catch (e) {
      console.error('Save failed:', e);
    }
  };

  const handleExport = () => {
    if (records.length === 0) { alert('暂无数据可导出'); return; }
    const headers = ['公司名称', '企业性质', '招聘类型', '行业', '主题', '截止时间', '招聘对象', '内推', '地点', '岗位', '需求', '网申链接', '来源', '置信度', '风险提示'];
    const rows = records.map(r => [
      r.company_name || '', r.company_type || '', r.recruitment_type || '',
      r.industry || '', r.theme || '', r.deadline || '',
      r.target_candidates || '', r.referral || '', r.locations || '',
      r.positions || '', r.requirements || '', r.application_url || '',
      r.source_url || '', String(r.confidence || 0), r.warnings || '',
    ]);
    const csvContent = '\uFEFF' + [headers, ...rows].map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `招聘信息_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const parseWarnings = (w: string | null): string[] => {
    if (!w) return [];
    try { return JSON.parse(w); } catch { return w ? [w] : []; }
  };

  const getConfidenceColor = (c: number) => {
    if (c >= 0.8) return 'text-green-600';
    if (c >= 0.5) return 'text-amber-600';
    return 'text-red-500';
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-6 py-4 border-b" style={{ borderColor: '#E5E2DD' }}>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-lg font-semibold" style={{ color: '#1A1A1A' }}>招聘信息识别</h2>
            <p className="text-xs mt-1" style={{ color: '#6B7280' }}>导入公众号招聘推文，AI 自动识别结构化招聘信息</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={fetchRecords} disabled={loading}>
              <RefreshCw className="w-3.5 h-3.5 mr-1" /> 刷新
            </Button>
            <Button variant="outline" size="sm" onClick={handleExport} disabled={records.length === 0}>
              <Download className="w-3.5 h-3.5 mr-1" /> 导出
            </Button>
          </div>
        </div>

        {/* Import mode tabs */}
        <div className="flex gap-1 p-1 rounded-lg" style={{ background: '#F8F7F5' }}>
          <button
            className={`px-4 py-1.5 text-sm rounded-md transition-all ${importMode === 'bookmarklet' ? 'bg-white shadow-sm font-medium' : 'text-gray-500 hover:text-gray-700'}`}
            onClick={() => setImportMode('bookmarklet')}
            style={importMode === 'bookmarklet' ? { color: '#2D6A6A' } : {}}
          >
            书签导入
          </button>
          <button
            className={`px-4 py-1.5 text-sm rounded-md transition-all ${importMode === 'manual' ? 'bg-white shadow-sm font-medium' : 'text-gray-500 hover:text-gray-700'}`}
            onClick={() => setImportMode('manual')}
            style={importMode === 'manual' ? { color: '#2D6A6A' } : {}}
          >
            手动粘贴
          </button>
        </div>
      </div>

      {/* Import area */}
      <div className="px-6 py-4 border-b" style={{ borderColor: '#E5E2DD', background: '#FAFAF8' }}>
        {importMode === 'bookmarklet' ? (
          <div className="space-y-3">
            <p className="text-sm" style={{ color: '#6B7280' }}>
              在浏览器中打开微信公众号招聘推文，点击书签即可一键导入识别
            </p>
            <div className="flex items-center gap-3">
              <a
                href={bookmarkletUrl || '#'}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium no-underline transition-transform hover:-translate-y-px"
                style={{ background: '#2D6A6A' }}
                onClick={e => {
                  if (!bookmarkletUrl) e.preventDefault();
                }}
                draggable
              >
                <BookmarkPlus className="w-4 h-4" />
                导入招聘信息
              </a>
              <span className="text-xs" style={{ color: '#6B7280' }}>
                ↑ 拖拽此按钮到书签栏，在公众号文章页面点击即可导入
              </span>
            </div>
            <Button variant="link" size="sm" className="text-xs p-0 h-auto" onClick={() => setShowBookmarkletGuide(true)}>
              如何使用书签导入？
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Input
                placeholder="文章标题（可选）"
                value={importForm.title}
                onChange={e => setImportForm(p => ({ ...p, title: e.target.value }))}
                className="text-sm"
              />
              <Input
                placeholder="公众号名称（可选）"
                value={importForm.accountName}
                onChange={e => setImportForm(p => ({ ...p, accountName: e.target.value }))}
                className="text-sm"
              />
            </div>
            <Input
              placeholder="原文链接（可选）"
              value={importForm.sourceUrl}
              onChange={e => setImportForm(p => ({ ...p, sourceUrl: e.target.value }))}
              className="text-sm"
            />
            <Textarea
              placeholder="粘贴文章正文内容..."
              value={importForm.contentText}
              onChange={e => setImportForm(p => ({ ...p, contentText: e.target.value }))}
              className="text-sm min-h-[100px]"
            />
            <Textarea
              placeholder="图片URL（每行一个，可选）"
              value={importForm.imageUrls}
              onChange={e => setImportForm(p => ({ ...p, imageUrls: e.target.value }))}
              className="text-sm min-h-[60px]"
            />
            <Button
              onClick={handleManualImport}
              disabled={importing}
              className="text-sm"
              style={{ background: '#D4853A', color: 'white' }}
            >
              {importing ? (
                <><RefreshCw className="w-4 h-4 mr-1 animate-spin" /> 识别中...</>
              ) : (
                '开始识别'
              )}
            </Button>
          </div>
        )}
      </div>

      {/* Records table */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center h-40 text-sm" style={{ color: '#6B7280' }}>
            <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> 加载中...
          </div>
        ) : records.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-sm" style={{ color: '#6B7280' }}>
            <BookmarkPlus className="w-8 h-8 mb-2 opacity-40" />
            <p>暂无招聘信息</p>
            <p className="text-xs mt-1">通过书签导入或手动粘贴公众号招聘推文</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs w-8">#</TableHead>
                <TableHead className="text-xs">公司名称</TableHead>
                <TableHead className="text-xs">招聘类型</TableHead>
                <TableHead className="text-xs">行业</TableHead>
                <TableHead className="text-xs">岗位</TableHead>
                <TableHead className="text-xs">地点</TableHead>
                <TableHead className="text-xs">截止时间</TableHead>
                <TableHead className="text-xs">网申链接</TableHead>
                <TableHead className="text-xs w-16">置信度</TableHead>
                <TableHead className="text-xs w-20">状态</TableHead>
                <TableHead className="text-xs w-24">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {records.map((r, idx) => {
                const warnings = parseWarnings(r.warnings);
                return (
                  <TableRow key={r.id} className="group">
                    <TableCell className="text-xs text-gray-400">{idx + 1}</TableCell>
                    <TableCell className="text-sm font-medium max-w-[160px] truncate" title={r.company_name || ''}>
                      {r.company_name || '-'}
                    </TableCell>
                    <TableCell className="text-xs">
                      {r.recruitment_type ? (
                        <span className="px-1.5 py-0.5 rounded text-xs" style={{ background: '#E8F5F0', color: '#2D6A6A' }}>
                          {r.recruitment_type}
                        </span>
                      ) : '-'}
                    </TableCell>
                    <TableCell className="text-xs text-gray-500 max-w-[80px] truncate">{r.industry || '-'}</TableCell>
                    <TableCell className="text-xs max-w-[160px] truncate" title={r.positions || ''}>{r.positions || '-'}</TableCell>
                    <TableCell className="text-xs max-w-[80px] truncate">{r.locations || '-'}</TableCell>
                    <TableCell className="text-xs">{r.deadline || '-'}</TableCell>
                    <TableCell className="text-xs">
                      {r.application_url ? (
                        <a href={r.application_url} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline inline-flex items-center gap-0.5">
                          <Link2 className="w-3 h-3" /> 链接
                        </a>
                      ) : '-'}
                    </TableCell>
                    <TableCell className={`text-xs font-medium ${getConfidenceColor(r.confidence)}`}>
                      {Math.round((r.confidence || 0) * 100)}%
                    </TableCell>
                    <TableCell className="text-xs">
                      <div className="flex flex-col gap-0.5">
                        {r.confirmed ? (
                          <span className="flex items-center gap-0.5 text-green-600"><CheckCircle2 className="w-3 h-3" /> 已确认</span>
                        ) : (
                          <span className="text-amber-500">待确认</span>
                        )}
                        {warnings.length > 0 && (
                          <span className="flex items-center gap-0.5 text-red-400" title={warnings.join('\n')}>
                            <AlertTriangle className="w-3 h-3" /> {warnings.length}条提示
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setEditRecord({ ...r })} title="编辑">
                          <Pencil className="w-3 h-3" />
                        </Button>
                        {!r.confirmed && (
                          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => handleConfirm(r.id)} title="确认">
                            <CheckCircle2 className="w-3 h-3 text-green-500" />
                          </Button>
                        )}
                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => handleDelete(r.id)} title="删除">
                          <Trash2 className="w-3 h-3 text-red-400" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Edit dialog */}
      <Dialog open={!!editRecord} onOpenChange={open => { if (!open) setEditRecord(null); }}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>编辑招聘信息</DialogTitle>
          </DialogHeader>
          {editRecord && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">公司名称</label>
                  <Input value={editRecord.company_name || ''} onChange={e => setEditRecord({ ...editRecord, company_name: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">企业性质</label>
                  <Input value={editRecord.company_type || ''} onChange={e => setEditRecord({ ...editRecord, company_type: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">招聘类型</label>
                  <Input value={editRecord.recruitment_type || ''} onChange={e => setEditRecord({ ...editRecord, recruitment_type: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">行业</label>
                  <Input value={editRecord.industry || ''} onChange={e => setEditRecord({ ...editRecord, industry: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">招聘主题</label>
                  <Input value={editRecord.theme || ''} onChange={e => setEditRecord({ ...editRecord, theme: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">截止时间</label>
                  <Input value={editRecord.deadline || ''} onChange={e => setEditRecord({ ...editRecord, deadline: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">招聘对象</label>
                  <Input value={editRecord.target_candidates || ''} onChange={e => setEditRecord({ ...editRecord, target_candidates: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">内推</label>
                  <Input value={editRecord.referral || ''} onChange={e => setEditRecord({ ...editRecord, referral: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">工作地点</label>
                  <Input value={editRecord.locations || ''} onChange={e => setEditRecord({ ...editRecord, locations: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">招聘岗位</label>
                  <Input value={editRecord.positions || ''} onChange={e => setEditRecord({ ...editRecord, positions: e.target.value })} />
                </div>
                <div className="col-span-2">
                  <label className="text-xs font-medium text-gray-500 mb-1 block">岗位要求</label>
                  <Textarea value={editRecord.requirements || ''} onChange={e => setEditRecord({ ...editRecord, requirements: e.target.value })} rows={3} />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">网申链接</label>
                  <Input value={editRecord.application_url || ''} onChange={e => setEditRecord({ ...editRecord, application_url: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">来源链接</label>
                  <Input value={editRecord.source_url || ''} onChange={e => setEditRecord({ ...editRecord, source_url: e.target.value })} />
                </div>
              </div>
              {parseWarnings(editRecord.warnings).length > 0 && (
                <div className="p-3 rounded-lg bg-amber-50 border border-amber-200">
                  <p className="text-xs font-medium text-amber-700 mb-1">风险提示</p>
                  <ul className="text-xs text-amber-600 space-y-0.5">
                    {parseWarnings(editRecord.warnings).map((w, i) => (
                      <li key={i} className="flex items-start gap-1"><AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" /> {w}</li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setEditRecord(null)}>取消</Button>
                <Button onClick={handleEditSave} style={{ background: '#2D6A6A', color: 'white' }}>保存</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Bookmarklet guide dialog */}
      <Dialog open={showBookmarkletGuide} onOpenChange={setShowBookmarkletGuide}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>如何使用书签导入</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 text-sm" style={{ color: '#1A1A1A' }}>
            <div className="p-3 rounded-lg" style={{ background: '#F8F7F5' }}>
              <p className="font-medium mb-2">第一步：安装书签</p>
              <ol className="text-xs space-y-1.5 text-gray-600 list-decimal pl-4">
                <li>确保浏览器书签栏已显示（Chrome 按 <kbd className="px-1 py-0.5 bg-gray-200 rounded text-xs">Ctrl+Shift+B</kbd>）</li>
                <li>将上方的 <strong style={{ color: '#2D6A6A' }}>「导入招聘信息」</strong> 按钮直接拖拽到书签栏</li>
                <li>书签安装完成</li>
              </ol>
            </div>
            <div className="p-3 rounded-lg" style={{ background: '#F8F7F5' }}>
              <p className="font-medium mb-2">第二步：导入公众号文章</p>
              <ol className="text-xs space-y-1.5 text-gray-600 list-decimal pl-4">
                <li>在浏览器中打开微信公众号招聘推文</li>
                <li>点击书签栏的 <strong>「导入招聘信息」</strong></li>
                <li>确认导入后，AI 自动识别招聘信息</li>
                <li>回到本页面查看识别结果</li>
              </ol>
            </div>
            <div className="p-3 rounded-lg border border-amber-200 bg-amber-50">
              <p className="text-xs font-medium text-amber-700 mb-1">注意事项</p>
              <ul className="text-xs text-amber-600 space-y-0.5">
                <li>• 必须在微信公众号文章页面点击书签才有效</li>
                <li>• 长图招聘推文也能识别（自动 OCR 图片）</li>
                <li>• 识别需要几秒钟，请耐心等待</li>
                <li>• 如果书签导入不成功，可使用「手动粘贴」方式</li>
              </ul>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
