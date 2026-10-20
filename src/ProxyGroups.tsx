import { useEffect, useId, useState } from 'react';
import { ArrowUpRight, Check, ChevronDown, Globe2, ShieldCheck, Zap } from 'lucide-react';
import type { ProxyNode } from './types';

type Props = {
  groups: ProxyNode[];
  proxies: Record<string, ProxyNode>;
  profileId: string;
  query: string;
  busy: boolean;
  delays: Record<string, number | 'timeout'>;
  selectNode: (group: string, name: string) => void;
  testGroup: (nodes: string[]) => void;
};

function Group({ group, proxies, query, expanded, toggle, busy, delays, selectNode, testGroup }: Omit<Props, 'groups' | 'profileId'> & { group: ProxyNode; expanded: boolean; toggle: () => void }) {
  const id = useId();
  const nodes = group.all || [];
  const matchesGroup = group.name.toLocaleLowerCase().includes(query);
  const visibleNodes = nodes.filter(name => matchesGroup || name.toLocaleLowerCase().includes(query));
  const canSelect = ['Selector', 'URLTest', 'Fallback'].includes(group.type);
  return <section className={`card proxy-group ${expanded ? 'is-expanded' : ''}`} aria-labelledby={`${id}-title`}>
    <h3 id={`${id}-title`} className="proxy-group-heading">
      <button className="proxy-group-toggle" aria-label={group.name} aria-expanded={expanded} aria-controls={`${id}-nodes`} onClick={toggle}>
        <span className="proxy-group-copy">
          <span className="proxy-group-name">{group.name}</span>
          <span className="proxy-group-summary"><span className="proxy-type">{group.type}</span><span className="proxy-current" title={group.now || '暂无选择'}>{group.now || '暂无选择'}</span></span>
        </span>
        <span className="proxy-group-count" aria-label={`${nodes.length} 个节点`}>{nodes.length}</span>
        <ChevronDown className="proxy-group-chevron" size={17} aria-hidden="true"/>
      </button>
    </h3>
    {expanded && <div id={`${id}-nodes`} className="proxy-group-panel" role="region" aria-label={`${group.name}的节点`}>
      <div className="proxy-group-tools"><span>{query && visibleNodes.length !== nodes.length ? `匹配 ${visibleNodes.length} / ${nodes.length} 个节点` : `${nodes.length} 个节点`}{!canSelect && ' · 由内核自动分配'}</span><button className="button small" disabled={busy || !nodes.length} onClick={() => testGroup(nodes)}><Zap size={14}/>测试延迟</button></div>
      <div className="node-grid">{visibleNodes.map(node => {
        const delay = delays[node] ?? proxies[node]?.history?.at(-1)?.delay;
        const selected = node === group.now;
        return <button key={node} className={`node-card ${selected ? 'chosen' : ''}`} aria-pressed={selected} disabled={busy || !canSelect} onClick={() => selectNode(group.name, node)}>
          <span className="node-top"><span className="node-glyph">{node === 'DIRECT' ? <ArrowUpRight size={19}/> : node === 'REJECT' ? <ShieldCheck size={19}/> : <Globe2 size={19}/>}</span><strong title={node}>{node}</strong>{selected && <Check size={15} className="selected-check"/>}</span>
          <span className="node-bottom"><span>{proxies[node]?.type || '代理组'}</span><span className={`latency ${typeof delay === 'number' && delay > 0 ? 'has-delay' : ''}`}>{delay === 'timeout' ? '超时' : typeof delay === 'number' ? `${delay} ms` : '未测速'}</span></span>
        </button>;
      })}</div>
    </div>}
  </section>;
}

export function ProxyGroups(props: Props) {
  const storageKey = `luma-proxy:expanded-groups:${props.profileId}`;
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => {
    try { const saved = JSON.parse(localStorage.getItem(storageKey) || '{}'); return saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {}; }
    catch { return {}; }
  });
  const [searchExpansion, setSearchExpansion] = useState<Record<string, boolean>>({});
  const query = props.query.trim().toLocaleLowerCase();
  useEffect(() => { try { localStorage.setItem(storageKey, JSON.stringify(expanded)); } catch { /* Window state remains usable if storage is unavailable. */ } }, [storageKey, expanded]);
  useEffect(() => { setSearchExpansion({}); }, [query]);
  const groups = props.groups.filter(group => !query || group.name.toLocaleLowerCase().includes(query) || group.all?.some(name => name.toLocaleLowerCase().includes(query)));
  const isOpen = (name: string) => query ? searchExpansion[name] !== false : expanded[name] === true;
  const allOpen = groups.length > 0 && groups.every(group => isOpen(group.name));
  const setExpansion = query ? setSearchExpansion : setExpanded;
  return <>
    <div className="proxy-list-toolbar"><span className="section-note">{query ? `${groups.length} / ${props.groups.length}` : props.groups.length} 个代理组</span><button className="text-button" disabled={!groups.length} onClick={() => setExpansion(previous => ({ ...previous, ...Object.fromEntries(groups.map(group => [group.name, !allOpen])) }))}>{allOpen ? '全部收起' : '全部展开'}<ChevronDown size={13} className={allOpen ? 'rotate-up' : ''}/></button></div>
    <div className="proxy-group-list">{groups.map(group => <Group {...props} key={group.name} group={group} query={query} expanded={isOpen(group.name)} toggle={() => setExpansion(previous => ({ ...previous, [group.name]: !isOpen(group.name) }))}/>)}</div>
    {!groups.length && <div className="proxy-no-results" role="status">没有匹配的代理组或节点，试试其他关键词。</div>}
  </>;
}
