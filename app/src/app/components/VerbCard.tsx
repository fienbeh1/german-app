import { useState } from 'react'
import { Badge } from './ui/badge'
import { RotateCcw, BarChart3 } from 'lucide-react'

const PRONOUN_COLORS: Record<string, { bg: string; border: string }> = {
  'ich':    { bg: 'rgba(30,58,138,0.2)', border: '#3B82F6' },
  'du':     { bg: 'rgba(88,28,135,0.2)', border: '#9333EA' },
  'er':     { bg: 'rgba(20,83,45,0.2)', border: '#16A34A' },
  'wir':    { bg: 'rgba(113,63,18,0.12)', border: '#EAB308' },
  'ihr':    { bg: 'rgba(124,45,18,0.2)', border: '#F97316' },
  'sie':    { bg: 'rgba(127,29,29,0.12)', border: '#EF4444' },
}

const INFINITIVE_BORDER = '#2196F3'

interface VerbCardProps {
  infinitiv?: string
  präsensIch?: string
  präsensDu?: string
  präsensEr?: string
  präteritumIch?: string
  partizipIi?: string
  hilfsverb?: string
  english?: string
  spanish?: string
  french?: string
  german?: string
  rank?: number | string
  freq?: number | string
  konjunktivIiIch?: string
  imperativSingular?: string
  imperativPlural?: string
}

export function VerbCard(props: VerbCardProps) {
  const [isFlipped, setIsFlipped] = useState(false)

  const german = props.infinitiv || props.german || ''
  const english = props.english || ''
  const spanish = props.spanish || ''
  const french = props.french || ''
  const rank = props.rank
  const freq = props.freq
  const präsensIch = props.präsensIch || ''
  const präsensDu = props.präsensDu || ''
  const präsensEr = props.präsensEr || ''
  const präteritum = props.präteritumIch || ''
  const partizip = props.partizipIi || ''
  const auxiliary = props.hilfsverb || ''
  const konjunktiv = props.konjunktivIiIch || ''
  const imperativSg = props.imperativSingular || ''
  const imperativPl = props.imperativPlural || ''

  const conjugationRow = (pronoun: string, label: string, content: string, extra?: string) => {
    const c = PRONOUN_COLORS[pronoun] || PRONOUN_COLORS['ich']
    return (
      <div className="flex items-baseline gap-1.5 rounded px-2 py-0.5 text-[11px] font-mono" style={{ backgroundColor: c.bg, borderLeft: `3px solid ${c.border}` }}>
        <span className="font-semibold opacity-80">{label}</span>
        <span>{content}</span>
        {extra && <span className="opacity-60">{extra}</span>}
      </div>
    )
  }

  return (
    <div
      className="perspective-1000 min-h-[16rem] cursor-pointer"
      onClick={() => setIsFlipped(!isFlipped)}
    >
      <div
        className={`relative w-full h-full transition-all duration-500 transform-style-3d ${
          isFlipped ? 'rotate-y-180' : ''
        }`}
      >
        {/* Front */}
        <div className={`absolute inset-0 backface-hidden ${isFlipped ? 'invisible' : ''}`}>
          <div className="h-full backdrop-blur-xl bg-gradient-to-br from-white/80 to-white/60 dark:from-gray-800/80 dark:to-gray-800/60 border border-white/30 dark:border-white/10 shadow-lg rounded-xl p-4 flex flex-col justify-between">
            <div className="flex items-start justify-between">
              <Badge variant="secondary" className="text-[10px]">Verb</Badge>
              {(rank || freq) && (
                <Badge variant="outline" className="text-[10px] flex items-center gap-1">
                  <BarChart3 className="size-2.5" />
                  {rank && <span>#{rank}</span>}
                  {freq && <span>Freq: {freq}</span>}
                </Badge>
              )}
            </div>

            <div className="my-1 text-center" style={{ borderBottom: `3px solid ${INFINITIVE_BORDER}`, paddingBottom: '0.5rem' }}>
              <h3 className="text-xl font-bold">{german}</h3>
              {auxiliary && (
                <span
                  className="inline-block text-[10px] px-2 py-0.5 rounded-full font-medium mt-1"
                  style={{
                    backgroundColor: auxiliary === 'sein' ? 'rgba(5,150,105,0.3)' : 'rgba(37,99,235,0.3)',
                    color: auxiliary === 'sein' ? '#6EE7B7' : '#93C5FD',
                  }}
                >
                  {auxiliary}
                </span>
              )}
            </div>

            <div className="text-[11px] space-y-1">
              {präsensIch && (
                <div>
                  <span className="opacity-50 text-[10px]">Präsens:</span>
                  <div className="grid grid-cols-2 gap-x-1 gap-y-0.5 mt-0.5">
                    {conjugationRow('ich', 'ich', präsensIch)}
                    {conjugationRow('du', 'du', präsensDu)}
                    <div className="col-span-2">
                      {conjugationRow('er', 'er/sie/es', präsensEr)}
                    </div>
                  </div>
                </div>
              )}
              <div className="grid grid-cols-2 gap-x-1 gap-y-0.5">
                {präteritum && conjugationRow('ich', 'Prät:', präteritum)}
                {partizip && (
                  <div className="flex items-baseline gap-1.5 rounded px-2 py-0.5 text-[11px] font-mono" style={{ backgroundColor: 'rgba(100,116,139,0.15)', borderLeft: '3px solid #64748B' }}>
                    <span className="font-semibold opacity-80">Perf:</span>
                    <span>{auxiliary === 'sein' ? 'ist' : 'hat'} {partizip}</span>
                  </div>
                )}
                {konjunktiv && conjugationRow('ich', 'KII:', konjunktiv)}
                {(imperativSg || imperativPl) && (
                  <div className="flex items-baseline gap-1.5 rounded px-2 py-0.5 text-[11px] font-mono flex-wrap" style={{ backgroundColor: 'rgba(124,45,18,0.12)', borderLeft: '3px solid #F97316' }}>
                    <span className="font-semibold opacity-80">Imp:</span>
                    {imperativSg && <span>(du) {imperativSg}</span>}
                    {imperativSg && imperativPl && <span className="mx-0.5">·</span>}
                    {imperativPl && <span>(ihr) {imperativPl}</span>}
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-1 text-[10px] text-gray-400 mt-1">
              <RotateCcw className="size-3" />
              Klicken zum Übersetzen
            </div>
          </div>
        </div>

        {/* Back */}
        <div className={`absolute inset-0 backface-hidden rotate-y-180 ${!isFlipped ? 'invisible' : ''}`}>
          <div className="h-full backdrop-blur-xl bg-gradient-to-br from-white/90 to-white/70 dark:from-gray-800/90 dark:to-gray-800/70 border border-white/30 dark:border-white/10 shadow-lg rounded-xl p-4 flex flex-col overflow-y-auto">
            <Badge variant="secondary" className="text-[10px] self-start">Übersetzung</Badge>
            <div className="flex-1 space-y-1.5 my-3">
              {german && <p className="text-sm font-semibold">{german}</p>}
              <p className="text-xs">
                <span
                  className="inline-block rounded px-1.5 py-0.5 text-xs font-medium mr-1"
                  style={{ backgroundColor: 'rgba(120,53,15,0.3)', color: '#FDE68A' }}
                >
                  EN
                </span>
                <span className="font-medium">{english}</span>
              </p>
              <p className="text-xs">
                <span
                  className="inline-block rounded px-1.5 py-0.5 text-xs font-medium mr-1"
                  style={{ backgroundColor: 'rgba(136,19,55,0.3)', color: '#FDA4AF' }}
                >
                  ES
                </span>
                <span className="font-medium">{spanish}</span>
              </p>
              <p className="text-xs"><span className="opacity-60">FR:</span> <span className="font-medium">{french}</span></p>

              <div className="pt-2 border-t border-white/20 dark:border-white/10 space-y-1.5">
                <p className="text-[10px] font-semibold opacity-70 uppercase tracking-wide">Konjugationen</p>
                {präsensIch && (
                  <div>
                    <p className="text-[10px] opacity-50">Präsens:</p>
                    <div className="grid grid-cols-2 gap-x-2 gap-y-0.5">
                      {conjugationRow('ich', 'ich', präsensIch)}
                      {conjugationRow('du', 'du', präsensDu)}
                      <div className="col-span-2">
                        {conjugationRow('er', 'er/sie/es', präsensEr)}
                      </div>
                    </div>
                  </div>
                )}
                {präteritum && (
                  <div>
                    <p className="text-[10px] opacity-50">Präteritum:</p>
                    {conjugationRow('ich', 'ich', präteritum)}
                  </div>
                )}
                {partizip && (
                  <div>
                    <p className="text-[10px] opacity-50">Perfekt:</p>
                    <div className="flex items-baseline gap-1.5 rounded px-2 py-0.5 text-[11px] font-mono" style={{ backgroundColor: 'rgba(100,116,139,0.15)', borderLeft: '3px solid #64748B' }}>
                      <span className="font-semibold opacity-80">{auxiliary === 'sein' ? 'ist' : 'hat'}</span>
                      <span>{partizip}</span>
                    </div>
                  </div>
                )}
                {konjunktiv && (
                  <div>
                    <p className="text-[10px] opacity-50">Konjunktiv II:</p>
                    {conjugationRow('ich', 'ich', konjunktiv)}
                  </div>
                )}
                {(imperativSg || imperativPl) && (
                  <div>
                    <p className="text-[10px] opacity-50">Imperativ:</p>
                    <div className="flex items-baseline gap-1.5 rounded px-2 py-0.5 text-[11px] font-mono flex-wrap" style={{ backgroundColor: 'rgba(124,45,18,0.12)', borderLeft: '3px solid #F97316' }}>
                      {imperativSg && <span>(du) {imperativSg}</span>}
                      {imperativSg && imperativPl && <span className="mx-0.5">·</span>}
                      {imperativPl && <span>(ihr) {imperativPl}</span>}
                    </div>
                  </div>
                )}
                {auxiliary && <p className="text-[10px] opacity-60">Hilfsverb: {auxiliary}</p>}
              </div>
            </div>
            <p className="text-[10px] opacity-50">
              <RotateCcw className="size-3 inline mr-1" />
              Zurück
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
