"use client";
export function Toggle({label,help,checked,onChange}: {label:string;help?:string;checked:boolean;onChange:(value:boolean)=>void}) {
 return <label className="toggle-row"><span><strong>{label}</strong>{help && <small>{help}</small>}</span><input type="checkbox" role="switch" checked={checked} onChange={e=>onChange(e.target.checked)}/><span className="switch-track" aria-hidden="true"/></label>;
}
export function NumberField({label,value,onChange,min=1,max,help,disabled=false}: {label:string;value:number;onChange:(value:number)=>void;min?:number;max?:number;help?:string;disabled?:boolean}) {
 return <label>{label}<input type="number" value={Number.isNaN(value)?"":value} min={min} max={max} step={1} required={!disabled} disabled={disabled} onChange={e=>onChange(e.target.valueAsNumber)}/>{help && <small className="field-help">{help}</small>}</label>;
}
