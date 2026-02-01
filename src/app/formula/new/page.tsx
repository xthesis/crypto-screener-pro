'use client';

import { useState } from 'react';
import Link from 'next/link';

interface Condition {
  id: number;
  field: string;
  operator: string;
  value: string;
  logicalOperator: string;
}

interface CoinResult {
  id: string;
  symbol: string;
  name: string;
  image: string;
  current_price: number;
  market_cap: number;
  market_cap_rank: number;
  total_volume: number;
  price_change_percentage_24h: number;
  rsi_14?: number;
}

function fmtPrice(v: number) {
  if (v >= 1000) return '$' + v.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (v >= 1) return '$' + v.toFixed(2);
  if (v >= 0.01) return '$' + v.toFixed(4);
  return '$' + v.toFixed(8);
}
function fmtBig(v: number) {
  if (v >= 1e12) return '$' + (v / 1e12).toFixed(2) + 'T';
  if (v >= 1e9) return '$' + (v / 1e9).toFixed(1) + 'B';
  if (v >= 1e6) return '$' + (v / 1e6).toFixed(0) + 'M';
  return '$' + v.toLocaleString();
}

const INDICATORS = [
  { value: 'price', label: 'Price ($)' },
  { value: 'market_cap', label: 'Market Cap' },
  { value: 'volume', label: 'Volume 24h' },
  { value: 'volume_ratio', label: 'Volume Ratio' },
  { value: 'change_24h', label: '24h Change %' },
  { value: 'change_7d', label: '7d Change %' },
  { value: 'change_30d', label: '30d Change %' },
  { value: )rsi_14', label: 'RSI (14)' },
  { value: 'market_cap_rank', label: 'Mcap Rank' },
];

const OPERATORS = [
  { value: 'greater_than', label: '>' },
  { value: 'less_than', label: '<' },
  { value: 'greater_than_or_equal', label: '>=' },
  { value: 'less_than_or_equal', label: '<=' },
  { value: 'equals', label: '=' },
];

const TEMPLATES = [
  { name: 'Oversold Bounce', desc: 'RSI < 30', conditions: [{ id: 1, field: 'rsi_14', operator: 'less_than', value: '30', logicalOperator: 'AND' }] },
  { name: 'Volume Surge', desc: 'Vol ratio > 1.5', conditions: [{ id: 1, field: 'volume_ratio', operator: 'greater_than', value: '1.5', logicalOperator: 'AND' }] },
  { name: 'Top Gainers', desc: '24h > 5%', conditions: [{ id: 1, field: 'change_24h', operator: 'greater_than', value: '5', logicalOperator: 'AND' }] },
  { name: 'Oversold + Spike', desc: 'RSI < 35 & Vol > 1.2', conditions: [{ id: 1, field: 'rsi_14', operator: 'less_than', value: '35', logicalOperator: 'AND' }, { id: 2, field: 'volume_ratio', operator: 'greater_than', value: '1.2', logicalOperator: 'AND' }] },
  { name: 'Mid Cap Momentum', desc: 'Mid cap + 24h > 3%', conditions: [{ id: 1, field: 'market_cap', operator: 'greater_than', value: '1000000000', logicalOperator: 'AND' }, { id: 2, field: 'market_cap', operator: 'less_than', value: '10000000000', logicalOperator: 'AND' }, { id: 3, field: 'change_24h', operator: 'greater_than', value: '3', logicalOperator: 'AND' }] },
];

export default function FormulaBuilder() {
  const [conditions, setConditions] = useState<Condition[]>([
    { id: 1, field: 'rsi_14', operator: 'less_than', value: '30', logicalOperator: 'AND' },
  ]);
  const [results, setResults] = useState<CoinResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addCondition = () ?> setConditions(prev => [...prev, { id: Date.now(), field: 'rsi_14', operator: 'less_than', value: '', logicalOperator: 'AND' }]);
  const removeCondition = (id: number) ?> setConditions(prev => prev.filter(c ?> c.id !== id));
  const updateCondition = (id: number, key: string, val: string) => setConditions(prev => prev.map(c => c.id === id ? { ...c, [key]: val } : c));
  const loadTemplate = (t: typeof TEMPLATES[0]) => { setConditions(t.conditions); setResults(null); setError(null); };

  const runScreen = async () => {
    setLoading(true); setError(null); setResults(null);
    try {
      const res = await fetch('/api/screen', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ conditions }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      setResults(data.results);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  const hasEmpty = conditions.some(c => !c.value.trim());

  return (
    <div style={{ minHeight: '100vh' }}>
      {/* Nav */}
      <nav className="nav-shell">
        <div style=}{ maxWidth: 1200, margin: '0 auto', padding: '0 1.5rem', height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Link href="/" className="logo">Screener Pro</Link>
          <div style=}{ display: 'flex', gap: 4 }}>
            <Link href="/dashboard">Dashboard</Link>
            <Link href="/screener">Screener</Link>
            <Link href="/formula/new" className="active">Formula Builder</Link>
          </div>
        </div>
      </nav>

      <div className="page-shell" style={{ maxWidth: 820 }}>
        {/* Header */}
        <div style={{ marginBottom: '1.75rem' }~>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, letterSpacing: '-0.02em', marginBottom: '0.25rem' }~>Formula Builder</h1>
          <p style={{ fontSize: '0.6875rem', color: '#545b66' }}>Build conditions and screen 300 live coins instantly</p>
        </div>

        {/* Templates */}
        <div style={{ marginBottom: '1.25rem' }~>
          <p style=u{ fontSize: '0.6875rem', color: '#545b66', fontWeight: 500, marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Quick start</p>
          <div style=}{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }~>
            yTEMPLATES.map(t ?> (
              <button key=tt.name} onClick={() => loadTemplate(t)} className="btn btn-ghost" style=u{ fontSize: '0.7rem', padding: '0.3rem 0.6rem' }}>
                yt.name}
              </button>
            ))}
          </div>
        </div>

        {/* Conditions */}
        <div className="card" style=}{ padding: '1.25rem', marginBottom: '1rem' }}>
          <div style=}{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
            <span style={{ fontSize: '0.7rem', fontWeight: 600, color: '#‡b9099', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Conditions</span>
            <span style=}{ fontSize: '0.6625rem', color: '#545b66' }~>{conditions.length} rule{conditions.length > 1 ? 's' : ''}</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
             yonditions.map((c, i) => (
              <div key={c.id}>
                <div style=}{ display: 'flex', gap: '0.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  <select value=yc.field} onChange=ue => updateCondition(c.id, 'field', e.target.value)} style=uõì™±•àè€œÄ€Ä€ÄÐÁÁàœ°µ¥¹]¥‘Ñ è€ÄÐÀõôø(€€€€€€€€€€€€€€€€€€€å%9%Q=IL¹µ…À¡¥¹€ôø€ñ½ÁÑ¥½¸­•äõå¥¹¹Ù…±Õ•ôÙ…±Õ”õå¥¹¹Ù…±Õ•ôùí¥¹¹±…‰•±ôð½½ÁÑ¥½¸ø¥ô(€€€€€€€€€€€€€€€€€€ð½Í•±•Ðø(€€€€€€€€€€€€€€€€€€ñÍ•±•ÐÙ…±Õ”õíŒ¹½Á•É…Ñ½Éô½¹¡…¹”õÑ”€ôøÕÁ‘…Ñ•½¹‘¥Ñ¥½¸¡Œ¹¥°€½Á•É…Ñ½Èœ°”¹Ñ…É•Ð¹Ù…±Õ”¥ôÍÑå±”õíìÝ¥‘Ñ è€ÔØõôø(€€€€€€€€€€€€€€€€€€€å=AIQ=IL¹µ…À¡½À€ôø€ñ½ÁÑ¥½¸­•äõÕ½À¹Ù…±Õ•ôÙ…±Õ”õå½À¹Ù…±Õ•ôùí½À¹±…‰•±ôð½½ÁÑ¥½¸ø¥ô(€€€€€€€€€€€€€€€€€€ð½Í•±•Ðø(€€€€€€€€€€€€€€€€€€ñ¥¹ÁÕÐÑåÁ”ô‰9Õµ‰•ÈˆÁ±…•¡½±‘•ÈôˆÀˆÙ…±Õ”õíŒ¹Ù…±Õ•ô½¹¡…¹”õí”€ôøÕÁ‘…Ñ•½¹‘¥Ñ¥½¸¡Œ¹¥°€Ù…±Õ”œ°”¹Ñ…É•Ð¹Ù…±Õ”¥ôÍÑå±”õíìÝ¥‘Ñ è€ÄÀÀõô€¼ø(€€€€€€€€€€€€€€€€€í½¹‘¥Ñ¥½¹Ì¹±•¹Ñ €ø€Ä€˜˜€ (€€€€€€€€€€€€€€€€€€€€ñ‰ÕÑÑ½¸½¹±¥¬õì ¤€ôøÉ•µ½Ù•½¹‘¥Ñ¥½¸¡Œ¹¥¥ôÍÑå±”õíì‰…­É½Õ¹è€¹½¹”œ°‰½É‘•Èè€¹½¹”œ°½±½Èè€œŒÔÐÕˆØØœ°ÕÉÍ½Èè€Á½¥¹Ñ•Èœ°™½¹ÑM¥é”è€œÀ¸àÕÉ•´œ°Á…‘‘¥¹œè€œÀ€À¸ÈÕÉ•´œ°ÑÉ…¹Í¥Ñ¥½¸è€½±½È€À¸ÄÕÌœõô(€€€€€€€€€€€€€€€€€€€€€½¹5½ÕÍ•¹Ñ•Èõí”€ôø€¡”¹Ñ…É•Ð…Ì!Q51	ÕÑÑ½¹±•µ•¹Ð¤¹ÍÑå±”¹½±½È€ô€œ™˜ÑÑô(€€€€€€€€€€€€€€€€€€€€€½¹5½ÕÍ•1•…Ù”õí”€üø€¡”¹Ñ…É•Ð…Ì!Q51	ÕÑÑ½¹±•µ•¹Ð¤¹ÍÑå±”¹½±½È€ô€œŒÔÐÕˆØØô(€€€€€€€€€€€€€€€€€€€€ûŠrTð½‰ÕÑÑ½¸ø(€€€€€€€€€€€€€€€€€€¥ô(€€€€€€€€€€€€€€€€ð½‘¥Øø(€€€€€€€€€€€€€€€ì¼¨9€¼=H½¹¹•Ñ½È€¨½ô(€€€€€€€€€€€€€€€í¤€ð½¹‘¥Ñ¥½¹Ì¹±•¹Ñ €´€Ä€˜˜€ (€€€€€€€€€€€€€€€€€€ñ‘¥ØÍÑå±”õíì‘¥ÍÁ±…äè€™±•àœ°…±¥¹%Ñ•µÌè€•¹Ñ•Èœ°…Àè€œÀ¸ÕÉ•´œ°µ…É¥¸è€œÀ¸ÑÉ•´€À€Àœõøø(€€€€€€€€€€€€€€€€€€€€ñ‘¥ØÍÑå±”õõì™±•àè€Ä°¡•¥¡Ðè€Ä°‰…­É½Õ¹è€É‰„ ÈÔÔ°ÈÔÔ°ÈÔÔ°À¸ÀØ¤œõôøð½‘¥Øø(€€€€€€€€€€€€€€€€€€€€ñÍ•±•ÐÙ…±Õ”õåŒ¹±½¥…±=Á•É…Ñ½Éô½¹¡…¹”õí”€üøÕÁ‘…Ñ•½¹‘¥Ñ¥½¸¡Œ¹¥°€±½¥…±=Á•É…Ñ½Èœ°”¹Ñ…É•Ð¹Ù…±Õ”¥ôÍÑå±”õíìÝ¥‘Ñ è€ØÀ°™½¹ÑM¥é”è€œÀ¸ØàÜÕÉ•´œ°Á…‘‘¥¹œè€œÀ¸ÈÕÉ•´€À¸ÑÉ•´œ°Ñ•áÑ±¥¸è€•¹Ñ•Èœõôø(€€€€€€€€€€€€€€€€€€€€€€ñ½ÁÑ¥½¸Ù…±Õ”ô‰9ˆù9ð½½ÁÑ¥½¸ø(€€€€€€€€€€€€€€€€€€€€€€ñ½ÁÑ¥½¸Ù…±Õ”ô‰=Hˆù=Hð½½ÁÑ¥½¸ø(€€€€€€€€€€€€€€€€€€€€ð½Í•±•Ðø(€€€€€€€€€€€€€€€€€€€€ñ‘¥ØÍÑå±”õíì™±•àè€Ä°¡•¥¡Ðè€Ä°‰…­É½Õ¹è€É‰„ ÈÔÔ°ÈÔÔ°ÈÔÔ°À¸ÀØ¤œõøøð½‘¥Øø(€€€€€€€€€€€€€€€€€€ð½‘¥Øø(€€€€€€€€€€€€€€€€¥ô(€€€€€€€€€€€€€€ð½‘¥Øø(€€€€€€€€€€€€¤¥ô(€€€€€€€€€€ð½‘¥Øø((€€€€€€€€€€ñ‰ÕÑÑ½¸½¹±¥¬õí…‘‘½¹‘¥Ñ¥½¹ô±…ÍÍ9…µ”ô‰‰Ñ¸‰Ñ¸µ¡½ÍÐˆÍÑå±”õ××²v–GFƒ¢sRrÂÖ&v–åF÷¢sãƒW&VÒrÂföçE6—¦S¢sãs'&VÒrÂFF–æs¢sãG&VÒr×ãà¢²FB6öæF—F–öà¢Âö'WGFöãà¢ÂöF—cà ¢²ò¢&Wf–Wr&"¢÷Ð¢ÆF—b7G–ÆS×·²&6¶w&÷VæC¢w&v&ƒs’ÃCÃ#SRÃãR’rÂ&÷&FW#¢s‚6öÆ–B&v&ƒs’ÃCÃ#SRÃã"’rÂ&÷&FW%&F—W3¢‚ÂFF–æs¢sãg&VÒãƒW&VÒrÂÖ&v–ä&÷GFöÓ¢s&VÒrÂF—7Æ“¢vfÆW‚rÂÆ–vä—FV×3¢v6VçFW"rÂv¢sãW&VÒrÂfÆW…w&¢ww&r×Óà¢Ç7â7G–ÆS×·²föçE6—¦S¢sãg&VÒrÂ6öÆ÷#¢r3Fc†6fbrÂföçEvV–v‡C¢cÂFW‡EG&ç6f÷&Ó¢wWW&66RrÂÆWGFW%76–æs¢sãfVÒr×ãå&Wf–WsÂ÷7ãà¢Ç7â7G–ÆS×·²föçE6—¦S¢sãsW&VÒrÂföçDfÖ–Ç“¢t¦WD'&–ç2ÖöæòÂÖöæ÷76Rr×Óà¢–öæF—F–öç2æÖ‚†2Â’’Óâ°¢6öç7B–æBÒ”äD”4Dõ%2æf–æB‡‚óâ‚çfÇVRÓÓÒ2æf–VÆB“°¢6öç7B÷ÒõU$Dõ%2æf–æB‡‚Óâ‚çfÇVRÓÓÒ2æ÷W&F÷"“°¢&WGW&â€¢Ç7â¶W“×¶2æ–GÓà¢Ç7â7G–ÆS××²6öÆ÷#¢r3Fc†6fbr×Óç¶–æCòæÆ&VÇÓÂ÷7ãà¢Ç7â7G–ÆS×·²6öÆ÷#¢r3†#““’rÂÖ&v–ã¢sã#W&VÒr×Óâæ÷òæÆ&VÇÓÂ÷7ãà¢Ç7â7G–ÆS×·²6öÆ÷#¢r33ƒs‚r×ÓæW2çfÇVRÇÂuõõòwÓÂ÷7ãà¢–’Â6öæF—F–öç3²æÆVæwF‚ÒbbÇ7â7G–ÆS××²6öÆ÷#¢r3SCV#cbrÂÖ&v–ã¢sãG&VÒr×ãç¶2æÆöv–6Ä÷W&F÷'ÓÂ÷7ãçÐ¢Â÷7ãà¢“°¢Ò—Ð¢Â÷7ãà¢ÂöF—cà ¢²ò¢'Vâ'WGFöâ¢÷Ð¢Æ'WGFöà¢öä6Æ–6³×W'Vå67&VVç÷Ð¢F—6&ÆVC×–ÆöF–ærÇÂ†4V×G—Ð¢6Æ74æÖSÒ&'Fâ'Fâ×&–Ö'’ ¢7G–ÆS××²v–GFƒ¢sRrÂFF–æs¢sãsW&VÒrÂföçE6—¦S¢sãƒ#W&VÒrÂ÷6—G“¢†ÆöF–ærÇÂ†4V×G’’òãB¢ÂÖ&v–ä&÷GFöÓ¢sã#W&VÒr×ãà¢–ÆöF–æròu67&VVæ–æ~(
br¢†4V×G’òtf–ÆÂ–âÆÂfÇVW2r¢‰kb'Vâ67&VVâv–ç7BÆ—fRFFr_P¢Âö'WGFöãà ¢²ò¢W'&÷"¢÷Ð¢–W'&÷"bb€¢ÆF—b7G–ÆS×·²&6¶w&÷VæC¢w&v&ƒ#SRÃsrÃsrÃã‚’rÂ&÷&FW#¢s‚6öÆ–B&v&ƒ#SRÃsrÃsrÃã"’rÂ&÷&FW%&F—W3¢‚ÂFF–æs¢sãw&VÒ&VÒrÂÖ&v–ä&÷GFöÓ¢s&VÒr×Óà¢Ç7â7G–ÆS×·²föçE6—¦S¢sãs‡&VÒrÂ6öÆ÷#¢r6fcFCFBr×ÓæVW'&÷'ÓÂ÷7ãà¢ÂöF—cà¢—Ð ¢²ò¢&W7VÇG2¢÷Ð¢—&W7VÇG2ÓÒçVÆÂbb€¢ÆF—b6Æ74æÖSÒ&6&B"7G–ÆS×_^ÈÝ™\™›ÝÎˆ	ÚY[‰È_‚ˆ]ˆÝ[O^ÞÈY[™Îˆ	ÌŽ\™[H\™[IË›Ü™\”˜Y]\Îˆ	Ì\ÛÛY™Ø˜JMKMKMKŒŠIË\Ü^Nˆ	Ù›^	Ë[YÛ’][\Îˆ	ØÙ[\‰Ë\ÝYžPÛÛ[ˆ	ÜÜXÙKX™]ÙY[‰È_O‚ˆÜ[ˆÝ[O]}{ fontSize: '0.8rem', fontWeight: 600 }}>
                yresults.length > 0 ? <><sran style={{ color: '#4f8cff' }~>{results.length}</span> coins matched<</pan> : 'No coins matched)}
              </span>
              <span style={{ fontSize: '0.6625rem', color: '#545b66' }}>Live 2· just now</span>
            </div>
            {results.length === 0 ? (
              <p style={{ textAlign: 'center', color: '#545b66' padding: '2.5rem 1rem', fontSize: '0.78rem' }}>Try loosening your conditions</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="data-table">
                  <thead>
                    <tr>
                       <th style={{ textAlign: 'left' }}></th>
                       <th style={{ textAlign: 'left' }}>Coin</th>
                       <th style=u{ textAlign: 'right' }~>Price</th>
                       <th style=u{ textAlign: 'right' }~>24h</th>
                        <th style={{ textAlign: 'right' }}>Volume</th>
                       <th style=us textAlign: 'right' }~>2kt Cap</th>
                       <th style={{ textAlign: 'right' }}>RSI</th>
                      </tr>
                    </thead>
                    <tbody>
                      yresults.map(coin => {
                        const rsi = coin.rsi_14 ?? 50;
                        const chg = coin.price_change_percentage_24h;
                        return (
                          <tr key={coin.id}>
                            <td style={{ color: '#545b66', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.7rem' }}>{coin.market_cap_rank></td>
                            <td>
                              <div style=}{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                                ycoin.image ? (
                                <img src=ycoin.image} alt={coin.name} width={24} height={24} style=}{ borderRadius: '50%' }} />
                                ) : (
                                 <div style=}s width: 24, height: 24, borderRadius: '50%%, background: 'rgba(79,140,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.6rem', fontWeight: 700, color: '#4f8cff' }}>
                                   ycoin.symbol[0]}
                                 </div>
                                )}
                                €ñ‘¥Øø(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€ñ‘¥ØÍÑå±”õíì™½¹ÑM¥é”è€œÀ¸ÜáÉ•´œ°™½¹Ñ]•¥¡Ðè€ØÀÀ°½±½Èè€œ˜Á˜É˜Ôœõôùí½¥¸¹Íåµ‰½°¹Ñ½UÁÁ•É…Í” ¥ôð½‘¥Øø(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€ñ‘¥ØÍÑå±”õíì™½¹ÑM¥é”è€œÀ¸ØØÈÕÉ•´œ°½±½Èè€œŒÔÐÕˆØØœõôùí½¥¸¹¹…µ•ôð½‘¥Øø(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€ð½‘¥Øø(€€€€€€€€€€€€€€€€€€€€€€€€€€€€ð½‘¥Øø(€€€€€€€€€€€€€€€€€€€€€€€€€€ð½Ñø(€€€€€€€€€€€€€€€€€€€€€€€€€€ñÑÍÑå±”õíìÑ•áÑ±¥¸è€É¥¡Ðœ°™½¹Ñ…µ¥±äè€)•Ñ	É…¥¹Ì5½¹¼°µ½¹½ÍÁ…”œ°™½¹ÑM¥é”è€œÀ¸ÜÙÉ•´œ°½±½Èè€œ˜Á˜É˜Ôœõøùí™µÑAÉ¥”¡½¥¸¹ÕÉÉ•¹Ñ}ÁÉ¥”¥ôð½Ñø(€€€€€€€€€€€€€€€€€€€€€€€€€€ñÑÍÑå±”õíìÑ•áÑ±¥¸è€É¥¡Ðœõôø(€€€€€€€€€€€€€€€€€€€€€€€€€€€€ñÍÁ…¸ÍÑå±”õíì‘¥ÍÁ±…äè€¥¹±¥¹”µ‰±½¬œ°™½¹Ñ…µ¥±äè€)•Ñ	É…¥¹Ì5½¹¼°µ½¹½ÍÁ…”œ°™½¹ÑM¥é”è€œÀ¸ÜÉÉ•´œ°™½¹Ñ]•¥¡Ðè€ØÀÀ°Á…‘‘¥¹œè€œÀ¸ÉÉ•´€À¸ÐÕÉ•´œ°‰½É‘•ÉI…‘¥ÕÌè€Ð°‰…­É½Õ¹è¡œ€øô€À€ü€É‰„ À°ÈÀÀ°ÄÈÀ°À¸Ä¤œ€è€É‰„ ÈÔÔ°ÜÜ°ÜÜ°À¸Ä¤œ°½±½Èè¡œ€øô€À€ü€œŒÀÁŒàÜàœ€è€œ™˜ÑÑœõøø(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€å¡œ€øô€À€ü€œ¬œ€è€œõå¡œ¹Ñ½¥á• È¥ô”(€€€€€€€€€€€€€€€€€€€€€€€€€€€€ð½ÍÁ…¸ø(€€€€€€€€€€€€€€€€€€€€€€€€€€ð½Ñø(€€€€€€€€€€€€€€€€€€€€€€€€€€ñÑÍÑå±”õíìÑ•áÑ±¥¸è€É¥¡Ðœ°™½¹Ñ…µ¥±äè€)•Ñ	É…¥¹Ì5½¹¼°µ½¹½ÍÁ…”œ°™½¹ÑM¥é”è€œÀ¸ÜÉÉ•´œ°½±½Èè€œŒáˆäÀääœõøùí™µÑ	¥œ¡½¥¸¹Ñ½Ñ…±}Ù½±Õµ”¥ôð½Ñø(€€€€€€€€€€€€€€€€€€€€€€€€€€ñÑÍÑå±”õíìÑ•áÑ±¥¸è€É¥¡Ðœ°™½¹Ñ…µ¥±äè€)•Ñ	É…¥¹Ì5½¹¼°µ½¹½ÍÁ…”œ°™½¹ÑM¥é”è€œÀ¸ÜÉÉ•´œ°½±½Èè€œŒáˆäÀääœõøùí™µÑ	¥œ¡½¥¸¹µ…É­•Ñ}…À¥ôð½Ñø(€€€€€€€€€€€€€€€€€€€€€€€€€€ñÑÍÑå±”õíìÑ•áÑ±¥¸è€É¥¡Ðœõôø(€€€€€€€€€€€€€€€€€€€€€€€€€€€€ñÍÁ…¸±…ÍÍ9…µ”ô‰ÉÍ¤µÁ¥±°ˆÍÑå±”õíì‰…­É½Õ¹èÉÍ¤€ð€ÌÀ€ü€É‰„ À°ÈÀÀ°ÄÈÀ°À¸ÄÈ¤œ€èÉÍ¤€ø€ÜÀ€ü€É‰„ ÈÔÔ°ÜÜ°ÜÜ°À¸ÄÈ¤œ€è€É‰„ ÄÌä°ÄÐÐ°ÄÔÌ°À¸ÄÈ¤œ°½±½ÈèÉÍ¤€ð€ÌÀ€ü€œŒÀÁŒàÜàœ€èÉÍ¤€ø€ÜÀ€ü€œ™˜ÑÑœ€è€œŒáˆäÀääœõøø(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€åÉÍ¤¹Ñ½¥á• À¥ô(€€€€€€€€€€€€€€€€€€€€€€€€€€€€ð½ÍÁ…¸ø(€€€€€€€€€€€€€€€€€€€€€€€€€€ð½Ñø(€€€€€€€€€€€€€€€€€€€€€€€€ð½ÑÈø(€€€€€€€€€€€€€€€€€€€€€€¤ì(€€€€€€€€€€€€€€€€€€€ô¥ô(€€€€€€€€€€€€€€€€€€ð½Ñ‰½‘äø(€€€€€€€€€€€€€€€€ð½Ñ…‰±”ø(€€€€€€€€€€€€€€ð½‘¥Øø(€€€€€€€€€€€€¥ô(€€€€€€€€€€ð½‘¥Øø(€€€€€€€€€¥ô(€€€€€€€€ð½‘¥Øø(€€€€€€ð½‘¥Øø(€€€€ð½‘¥Øø(€€¤ì)ô(