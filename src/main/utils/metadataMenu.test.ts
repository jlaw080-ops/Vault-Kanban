import { describe, it, expect } from 'vitest'
import { parseMetadataMenuPresets } from './metadataMenu'

// 사용자 볼트 실측 구조 (2026-08-06) 축약판
const REAL_SHAPE = JSON.stringify({
  presetFields: [
    {
      name: 'status',
      type: 'Select',
      options: {
        sourceType: 'ValuesList',
        valuesList: { '1': 'backlog', '2': 'planned', '3': 'in-progress', '4': 'review', '5': 'done' }
      }
    },
    {
      name: 'priority',
      type: 'Select',
      options: {
        sourceType: 'ValuesList',
        valuesList: { 낮음: 'low', 중간: 'mid', 높음: 'high' }
      }
    },
    {
      name: 'project',
      type: 'Select',
      options: {
        sourceType: 'ValuesList',
        valuesList: { '1': '신재생에너지제안(EPC)', '2': '에너빌드', '3': 'Private' }
      }
    }
  ]
})

describe('parseMetadataMenuPresets', () => {
  it('실측 구조에서 세 필드를 추출한다', () => {
    const result = parseMetadataMenuPresets(REAL_SHAPE)
    expect(result).toEqual({
      statuses: ['backlog', 'planned', 'in-progress', 'review', 'done'],
      priorities: ['low', 'mid', 'high'],
      projects: ['신재생에너지제안(EPC)', '에너빌드', 'Private']
    })
  })

  it('깨진 JSON → null', () => {
    expect(parseMetadataMenuPresets('{not json')).toBeNull()
  })

  it('presetFields 없음 → null', () => {
    expect(parseMetadataMenuPresets('{"version": "1.0"}')).toBeNull()
    expect(parseMetadataMenuPresets('"just a string"')).toBeNull()
  })

  it('project 필드 없음 → projects는 빈 배열', () => {
    const json = JSON.stringify({
      presetFields: [
        {
          name: 'status',
          type: 'Select',
          options: { sourceType: 'ValuesList', valuesList: { '1': 'backlog' } }
        }
      ]
    })
    expect(parseMetadataMenuPresets(json)).toEqual({
      statuses: ['backlog'],
      priorities: [],
      projects: []
    })
  })

  it('순번 키 순서 보존 — 키 정의 순서가 아니라 숫자 오름차순', () => {
    const json = JSON.stringify({
      presetFields: [
        {
          name: 'project',
          type: 'Select',
          options: { sourceType: 'ValuesList', valuesList: { '10': 'J번째', '2': 'B번째', '1': 'A번째' } }
        }
      ]
    })
    expect(parseMetadataMenuPresets(json)?.projects).toEqual(['A번째', 'B번째', 'J번째'])
  })

  it('숫자·비숫자 키 혼재 시 숫자 키 먼저, 비숫자 키는 뒤에', () => {
    const json = JSON.stringify({
      presetFields: [
        {
          name: 'project',
          type: 'Select',
          options: { sourceType: 'ValuesList', valuesList: { 별칭: 'Z값', '2': 'B값', '1': 'A값' } }
        }
      ]
    })
    expect(parseMetadataMenuPresets(json)?.projects).toEqual(['A값', 'B값', 'Z값'])
  })

  it('sourceType이 ValuesList가 아니면 무시', () => {
    const json = JSON.stringify({
      presetFields: [
        {
          name: 'project',
          type: 'Select',
          options: { sourceType: 'ValuesListNotePath', valuesList: { '1': '무시할값' } }
        }
      ]
    })
    expect(parseMetadataMenuPresets(json)?.projects).toEqual([])
  })

  it('type이 Select가 아니면 무시', () => {
    const json = JSON.stringify({
      presetFields: [
        {
          name: 'project',
          type: 'Input',
          options: { sourceType: 'ValuesList', valuesList: { '1': '무시할값' } }
        }
      ]
    })
    expect(parseMetadataMenuPresets(json)?.projects).toEqual([])
  })

  it('공백 값 제외·trim·중복 제거', () => {
    const json = JSON.stringify({
      presetFields: [
        {
          name: 'project',
          type: 'Select',
          options: {
            sourceType: 'ValuesList',
            valuesList: { '1': '  에너빌드  ', '2': '', '3': '   ', '4': '에너빌드', '5': 'Private' }
          }
        }
      ]
    })
    expect(parseMetadataMenuPresets(json)?.projects).toEqual(['에너빌드', 'Private'])
  })

  it('문자열이 아닌 값은 건너뛴다', () => {
    const json = JSON.stringify({
      presetFields: [
        {
          name: 'project',
          type: 'Select',
          options: { sourceType: 'ValuesList', valuesList: { '1': 42, '2': null, '3': '정상값' } }
        }
      ]
    })
    expect(parseMetadataMenuPresets(json)?.projects).toEqual(['정상값'])
  })

  it('앱이 안 쓰는 preset 필드(sub_project 등)는 결과에 없다', () => {
    const json = JSON.stringify({
      presetFields: [
        {
          name: 'sub_project',
          type: 'Select',
          options: { sourceType: 'ValuesList', valuesList: { '1': '값' } }
        }
      ]
    })
    expect(parseMetadataMenuPresets(json)).toEqual({ statuses: [], priorities: [], projects: [] })
  })
})
