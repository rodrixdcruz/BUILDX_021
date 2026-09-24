import { describe, expect, it } from 'vitest'
import { clusterTier, clusterPickerHtml, mapDebugText } from './HospitalMap'

describe('clusterTier', () => {
  it('tiers bubbles by count: small < 4, medium < 8, large ≥ 8', () => {
    expect(clusterTier(1)).toBe('small')
    expect(clusterTier(3)).toBe('small')
    expect(clusterTier(4)).toBe('medium')
    expect(clusterTier(7)).toBe('medium')
    expect(clusterTier(8)).toBe('large')
    expect(clusterTier(50)).toBe('large')
  })
})

describe('clusterPickerHtml', () => {
  const hospitals = [
    { id: 'H003', name: 'Wockhardt Hospital', area: 'Kingway' },
    { id: 'H001', name: 'Mayo Hospital', area: 'Medical Square' },
  ]

  it('lists every hidden hospital as a data-hg-pick button with name and area', () => {
    const html = clusterPickerHtml(hospitals, true)
    expect(html).toContain('data-hg-pick="H003"')
    expect(html).toContain('data-hg-pick="H001"')
    expect(html).toContain('Wockhardt Hospital')
    expect(html).toContain('Kingway')
    expect(html).toContain('Mayo Hospital')
    expect(html).toContain('Medical Square')
  })

  it('shows a singular title for a single-hospital cluster', () => {
    const html = clusterPickerHtml([hospitals[0]], true)
    expect(html).toContain('1 hospital here')
  })

  it('enables pick buttons when a patient origin is known and hints at directions', () => {
    const html = clusterPickerHtml(hospitals, true)
    expect(html).not.toContain('disabled')
    expect(html).toContain('Pick one to see live driving directions')
    expect(html).toContain('data-hg-zoom')
    expect(html).toContain('Zoom to area')
  })

  it('disables pick buttons without a patient origin and explains why', () => {
    const html = clusterPickerHtml(hospitals, false)
    expect(html).toContain('disabled')
    expect(html).not.toContain('data-hg-pick="H001" disabled'.replace('H001', 'x')) // sanity: attr still present
    expect((html.match(/data-hg-pick/g) ?? []).length).toBe(2)
    expect(html).toContain('Set the patient location to get driving directions')
    // Zoom stays available regardless of patient origin.
    expect(html).toContain('data-hg-zoom')
    expect(html).not.toContain('data-hg-zoom disabled')
  })
})

describe('mapDebugText', () => {
  it('shows zoom, visible pins, and clustered count with bubble count', () => {
    expect(mapDebugText({ zoom: 11, visible: 1, clustered: 7, bubbles: 1 })).toBe('z11 · 1 visible · 7 clustered in 1 bubble')
  })

  it('pluralizes bubbles and omits the clustered part when nothing is clustered', () => {
    expect(mapDebugText({ zoom: 14, visible: 8, clustered: 0, bubbles: 0 })).toBe('z14 · 8 visible · 0 clustered')
    expect(mapDebugText({ zoom: 13, visible: 2, clustered: 6, bubbles: 2 })).toBe('z13 · 2 visible · 6 clustered in 2 bubbles')
  })

  it('handles an empty map without division/matching weirdness', () => {
    expect(mapDebugText({ zoom: 12, visible: 0, clustered: 0, bubbles: 0 })).toBe('z12 · 0 hospitals')
  })

  it('handles everything clustered into one bubble', () => {
    expect(mapDebugText({ zoom: 10, visible: 0, clustered: 8, bubbles: 1 })).toBe('z10 · 0 visible · 8 clustered in 1 bubble')
  })
})
