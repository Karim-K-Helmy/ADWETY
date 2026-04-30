import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, FileImage, ScanLine, UploadCloud, XCircle } from 'lucide-react';
import EmptyState from '../components/EmptyState';
import { usePreferences } from '../context/PreferencesContext';
import { useToast } from '../context/ToastContext';
import { postMultipart } from '../lib/api';
import { formatCurrency } from '../lib/utils';

function confidenceTone(value) {
  if (value >= 0.8) return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-500/10 dark:text-emerald-200';
  if (value >= 0.5) return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-400/30 dark:bg-amber-500/10 dark:text-amber-200';
  return 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-400/30 dark:bg-rose-500/10 dark:text-rose-200';
}

export default function PrescriptionScannerPage() {
  const { t, language } = usePreferences();
  const toast = useToast();
  const [file, setFile] = useState(null);
  const [stage, setStage] = useState(0);
  const [done, setDone] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState(null);
  const [error, setError] = useState('');
  const steps = useMemo(() => [t('scanner.uploading'), t('scanner.reading'), t('scanner.extracting'), t('scanner.matching'), t('scanner.checking')], [t]);
  const previewUrl = useMemo(() => file && file.type?.startsWith('image/') ? URL.createObjectURL(file) : '', [file]);

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  function chooseFile(nextFile) {
    setFile(nextFile);
    setStage(0);
    setDone(false);
    setScanResult(null);
    setError('');
  }

  async function process() {
    if (!file) {
      toast.warning(t('scanner.uploadTitle'));
      return;
    }

    const formData = new FormData();
    formData.append('prescription_image', file);
    formData.append('consent_to_ai_processing', 'true');
    setDone(false);
    setScanResult(null);
    setError('');
    setScanning(true);
    setStage(1);

    const timer = window.setInterval(() => {
      setStage((current) => Math.min(steps.length - 1, current + 1));
    }, 550);

    try {
      const result = await postMultipart('/prescriptions/scan', formData);
      setScanResult(result.data || null);
      setStage(steps.length);
      setDone(true);
      toast.success(t('common.completed'));
    } catch (scanError) {
      setError(scanError.message || t('toast.failed'));
      setStage(0);
      toast.error(t('toast.failed'));
    } finally {
      window.clearInterval(timer);
      setScanning(false);
    }
  }

  const extractedDrugs = scanResult?.extracted_drugs || [];

  return (
    <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
      <section className="space-y-6">
        <div className="card p-6">
          <label className="flex min-h-72 cursor-pointer flex-col items-center justify-center rounded-3xl border-2 border-dashed border-cyan-200 bg-cyan-50 p-8 text-center text-cyan-800 transition hover:border-cyan-400 dark:border-cyan-400/30 dark:bg-cyan-500/10 dark:text-cyan-200">
            <UploadCloud className="h-12 w-12" />
            <p className="mt-4 text-xl font-semibold">{t('scanner.uploadTitle')}</p>
            <p className="mt-2 text-sm">{t('scanner.uploadHint')}</p>
            <input className="hidden" type="file" accept="image/*,.pdf" onChange={(event) => chooseFile(event.target.files?.[0] || null)} />
          </label>

          {file ? (
            <div className="mt-5 sub-card p-4">
              <div className="flex items-center gap-3">
                <FileImage className="h-5 w-5 text-cyan-500" />
                <div>
                  <p className="font-medium text-primary">{file.name}</p>
                  <p className="text-xs text-muted">{Math.round(file.size / 1024)} KB</p>
                </div>
              </div>
              {previewUrl ? <img src={previewUrl} alt="preview" className="mt-4 max-h-56 w-full rounded-2xl object-cover" /> : null}
            </div>
          ) : null}

          {error ? (
            <div className="mt-5 flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-100">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          ) : null}

          <button className="btn-primary mt-5 w-full gap-2" type="button" onClick={process} disabled={scanning}>
            <ScanLine className="h-4 w-4" />
            {scanning ? t('common.processing') : t('actions.scanPrescription')}
          </button>
        </div>

        <div className="card p-6">
          <h3 className="text-xl font-semibold text-primary">{t('common.processing')}</h3>
          <div className="mt-5 space-y-3">
            {steps.map((label, index) => (
              <div key={label} className="flex items-center gap-3">
                <span className={`flex h-8 w-8 items-center justify-center rounded-full ${stage > index ? 'bg-emerald-500 text-white' : stage === index ? 'bg-cyan-500 text-white' : 'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>
                  {stage > index ? <CheckCircle2 className="h-4 w-4" /> : index + 1}
                </span>
                <span className="text-sm font-medium text-primary">{label}</span>
              </div>
            ))}
          </div>
          <div className="mt-5 h-3 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
            <div className="h-full rounded-full bg-cyan-500 transition-all" style={{ width: `${Math.min(100, stage / steps.length * 100)}%` }} />
          </div>
        </div>
      </section>

      <section className="card p-6">
        {!done || !scanResult ? (
          <EmptyState title={t('scanner.extractedMedicines')} description={t('scanner.uploadHint')} />
        ) : (
          <div className="space-y-6">
            <div>
              <h3 className="text-xl font-semibold text-primary">{t('scanner.extractedText')}</h3>
              <div className="mt-3 min-h-24 whitespace-pre-wrap sub-card p-4 text-sm text-muted">
                {scanResult.extracted_text || 'No readable prescription text was returned.'}
              </div>
            </div>

            <div>
              <h3 className="text-xl font-semibold text-primary">{t('scanner.matchedMedicines')}</h3>
              {!extractedDrugs.length ? (
                <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700 dark:border-amber-400/30 dark:bg-amber-500/10 dark:text-amber-100">
                  No medicine names were confidently extracted from this prescription.
                </div>
              ) : (
                <div className="mt-4 space-y-4">
                  {extractedDrugs.map((item) => {
                    const matched = item.matched_drug;
                    const confidence = Number(item.confidence_score || 0);
                    const pharmacies = matched?.pharmacies || [];
                    return (
                      <div key={`${item.id}-${item.extracted_name}`} className="sub-card p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold text-primary">{item.extracted_name}</p>
                            <p className="mt-1 text-sm text-muted">{matched ? `${matched.name} ${matched.strength || ''} ${matched.form || ''}`.trim() : t('scanner.notMatched')}</p>
                          </div>
                          <span className={`badge ${confidenceTone(confidence)}`}>{Math.round(confidence * 100)}%</span>
                        </div>
                        <div className="mt-3 flex items-center gap-2 text-sm">
                          {matched ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <XCircle className="h-4 w-4 text-rose-500" />}
                          <span className="text-muted">{matched ? t('scanner.matched') : t('scanner.notMatched')}</span>
                          {item.match_score ? <span className="text-xs text-muted">Match {Math.round(item.match_score * 100)}%</span> : null}
                        </div>
                        {pharmacies.length ? (
                          <div className="mt-4 space-y-2">
                            {pharmacies.map((pharmacy) => (
                              <div key={pharmacy.inventory_id || pharmacy.id} className="rounded-2xl border border-soft p-3 text-sm">
                                <div className="flex justify-between gap-3">
                                  <span className="font-medium text-primary">{pharmacy.name}</span>
                                  <span className="text-muted">{formatCurrency(pharmacy.price, language)} · Qty {pharmacy.quantity}</span>
                                </div>
                                {pharmacy.address ? <p className="mt-1 text-xs text-muted">{pharmacy.address}</p> : null}
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
