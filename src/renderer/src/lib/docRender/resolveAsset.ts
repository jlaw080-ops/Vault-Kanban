import type { AssetResolver } from '@renderer/types'

/**
 * 로컬 볼트 이미지 URL 접두사.
 * MarkdownDocument 의 urlTransform 이 이 접두사를 통과시켜야 이미지가 뜬다
 * (react-markdown 기본 동작은 미허용 프로토콜을 빈 문자열로 지운다).
 */
export const VAULT_IMG_URL_PREFIX = 'vault-img://'

/**
 * 로컬 볼트 이미지를 가리키는 커스텀 프로토콜 URL 을 만든다.
 * 실제 파일 해석은 메인 프로세스(src/main/utils/assetResolver.ts)가 담당한다.
 *
 * host 를 'asset' 으로 고정하고 값을 쿼리로 넘기는 이유: host 자리에 경로를 넣으면
 * 한글·공백·슬래시에서 URL 파싱이 깨진다.
 */
export const localResolver: AssetResolver = (notePath, target) =>
  `${VAULT_IMG_URL_PREFIX}asset/?note=${encodeURIComponent(notePath)}&target=${encodeURIComponent(target)}`
