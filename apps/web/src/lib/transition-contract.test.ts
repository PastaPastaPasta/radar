import { describe, expect, it } from 'vitest'
import { transitionTarget } from './transition-contract'

/** Mainnet transitions as Platform Explorer returns them (the start of `data`; the reader needs no more). */
const NAMES_A_CONTRACT: [string, string, ReturnType<typeof transitionTarget>][] = [
  [
    'batch / document-create D54E3469',
    'AgEVWfMilR4UwW99f5ZDE3orBhTViyXyWRosHoiwkzPQmQEAAAACO3NFd4tYH1s48SQLiC/kYYDZb3Kh25McAj6fzVcmc0QYDmNvbnRhY3RSZXF1ZXN0oqG0rG/vIuoqGmjoEjZEs1eHX2tBLBgQkoHBRueycbwAAPDVZT9t9mt9B+t6kKu/6O4/zy8tVFK0lHB9rFIbW7XLBRBhY2NvdW50UmVmZXJlbmNlBPwD++AAEmVu',
    { contract: 'Bwr4WHCPz5rFVAD87RqTs3izo4zpzwsEdKPWUT1NS1C7', documentType: 'contactRequest' },
  ],
  [
    'batch / document-replace 803D8A96',
    'AgEVWfMilR4UwW99f5ZDE3orBhTViyXyWRosHoiwkzPQmQEAAQACaIooA/ZZylcq3ZOjjJzEFU6kbaroLhMAsWaaXAYx1uEIBHNpdGXhzcMckHzfVPRiNp5VVl/qjuQ4S3UAIg+0Rvv8d/FcugAAAwQHY29udGVudBJRZGFzaC1tYW5pZmVzdDp2MTpiZDFkZWFkZWFjNTFlYjFhNmY4ODY5MTQ4MmYwNWQ1OWRiM2MzYjk2',
    { contract: 'GCSi8NkjXyRpLC7FsEnCfx5ntmWZ16bD2t9zc4JiT4X3', documentType: 'site' },
  ],
  [
    'batch / document-index-only-delete EE8320DB',
    'AgEVWfMilR4UwW99f5ZDE3orBhTViyXyWRosHoiwkzPQmQEABgACuUOeVar0yyfFCSDSLhcYE7myRnKuUnm0XwmAf1WZumEEEGxvZ2luS2V5UmVzcG9uc2Xvlg6laXLrrb74on732lyB/0uzigKWl0V+JNpCt5tUtwAAAxZhcHBFcGhlbWVyYWxQdWJLZXlIYXNoC90Ri6pDb/Ip+GxkwfRmyyCbf2Q1EGVuY3J5cHRlZFBh',
    { contract: 'H8F9mP1BM55TE1ShsxPZHzhyinaMdY9bMmP85mkDhcJJ', documentType: 'loginKeyResponse' },
  ],
  [
    'data-contract-create C0721475',
    'AAEBRWAMo51IyWIc/1AS9FqPZDtJo6w4Jwd1qX1FARFoLbQCAAAAAAEBAAABAAG7UVoqsW3aeaFBQ2SfO9sSUL1ZrxPjtbewyuvwNHlCIgAECmNvbGxlY3Rpb24WCxIEdHlwZRIGb2JqZWN0EhBkb2N1bWVudHNNdXRhYmxlEwESDGNhbkJlRGVsZXRlZBMAEgx0cmFuc2ZlcmFibGUDABIJaW1tdXRhYmxlFQISBHNsdWcS',
    { contract: '5fp5WNYk3Rvw6sbU3UqXVeEoDwVM61Q6XFtjg9Qs91Bq' },
  ],
  [
    'data-contract-update 50BFDB7B',
    'AQADAZFhTl/dKiXTq040+FxGAY0ngOs9OYeQtXGPgq9Q2ZlxAQAAAAABAQAAAQILMqKXed0oEMgRJo511GBXj45uAW1lAoS67OnrzC9DugACBG5vdGUWAxIEdHlwZRIGb2JqZWN0Egpwcm9wZXJ0aWVzFgESB21lc3NhZ2UWAxIEdHlwZRIGc3RyaW5nEgltYXhMZW5ndGgFgBIIcG9zaXRpb24FABIUYWRkaXRpb25hbFBy',
    { contract: 'AnWB76y1H3AFDVaemRW3pqMmorbbomsRuYZ7Ettvw6XJ' },
  ],
  [
    'masternode-vote 6103E7DC',
    'CAAUTSFgDrfzcgPOvvOsXF1PqmBj2ReO33Rvg4okQPu0KNp+XuoPMMtwvbuwPXLuSCFGq6VbcDKNux/wIa8VC5VcAAAA5mjGWa9mruHnLBht3ntbfgodcSoJxA1XIfYiv1PFMVUGZG9tYWluEnBhcmVudE5hbWVBbmRMYWJlbAISBGRhc2gSBHBhMW4AL97VshfeRdalITTmukuqm1lQr5IHc2U3nbc/QRL8Us37AlIAQR+1',
    { contract: 'GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec', documentType: 'domain' },
  ],
  [
    'batch / token-transfer A77822AC',
    'AgGrF9BHzNVam9qFvCzzP639hbPJz+FkhNf63p6KCVRDPwEBAgAABQBrBIDMUdc69TASV+H4yHZQ3ZYzMqG4/Cb6mZccWMwQ/bp0mSJxQrO4yUxeZqC8ehwKhu0Ed0p1YbrHP+EA3aVsAPwAHK/ARisQkU+HLg3cJAFlbAxjf7peqLEhOp09covsBRre+BwBD3BheW91dCBDMkpEbUtvZwAAAANBH6bNqxFXjS/Rh9LGJX20',
    { contract: '8CkcAPokwFdxEu2tUu2VdLTjgK3eeR1wUGJcxhjsWaDz' },
  ],
  [
    'batch / token-mint E1AD9911',
    'AgFL5JWw4FXba8/CSwjkiJObHs6jUzRXAl3omBxgKERYxQEBAQAABQBXT647rMvvtX9Q/8VZlmHvgWUirq8Yi9/ok5GEsv3CMFfs9QswQtHN9XAlzIZUcoqere9WOtv9wXIp2M5vKI9hAAFL5JWw4FXba8/CSwjkiJObHs6jUzRXAl3omBxgKERYxfwdzWUAAQt0b3AtdXAgbWludAEBQSDham7f7BwDTNH/Ga4lxasiEnqc',
    { contract: '6spwVv7AmXLS7vc5RXXAnLM6t5ZNLsSKzYYxPhc1viUf' },
  ],
  [
    'batch / document-delete CDEA0E77',
    'AgFc57Vuj+E8W3ETX2Tc25G/GJiehsTcg5Xnj46C9JIzmQEAAgACsqlsX7n7LHTJYxNtt88U+8CL68P2VmB6M5KXFkakVAdABWNodW5r4c3DHJB831T0YjaeVVZf6o7kOEt1ACIPtEb7/HfxXLoAAAAIQR8YwJxUxHE8cIlg0/LayqzZLayBOrKIjV9x0SIT9+Kd0wV67kLo41hIowzLIUp37mhV25hl3imkBYcPpPFc/kr5',
    { contract: 'GCSi8NkjXyRpLC7FsEnCfx5ntmWZ16bD2t9zc4JiT4X3', documentType: 'chunk' },
  ],
]

const NAMES_NONE: [string, string][] = [
  [
    'identity-update 5EA66654',
    'BgAVWfMilR4UwW99f5ZDE3orBhTViyXyWRosHoiwkzPQmQQEAQEGAgACAQDhzcMckHzfVPRiNp5VVl/qjuQ4S3UAIg+0Rvv8d/FcugAUIh3ZjJ5FxbTK/NC2JAppg2gKHeIB/QAAAASoF8gAAf0AAAGj6fRATQABBQAAQR84C1mGJF6ZKsMrLfjncUQ6yE9Y/zO25rEr4y7l7OqhlEs65CM4+VVsreKRsGPDLBbNYu80hC6g',
  ],
  [
    'identity-top-up 82A158B3',
    'BAAAxgEBX254WeLtZ+GJWnUMfHajw3dU/HMeqsVVUL5uOVEy8/8BAAAAot1CASOpCYdtPgefZa274cIFpmzM/EH3imzjArLFgYAsHVVggzz2TcDkeiQRglJDVkUFu/WDQvIrAAAAAAAAAJFyOFvuthtjbKXCMvKA1PI9RvdXfzQSm07uLPCuxC5ya2KDuclhJEdEk9FUz9zJxwPcVSVc7ES2CzEbmw7spW5sG8pvQN1/Pey3',
  ],
  [
    'identity-create 8ACDC820',
    'AwADAAAAAAAAACECozH13Qn2ntR1unm5HkJhANkjYj7zxiKsjk0OktyAfKNBICa5rlbsc2YEDOnt9vrOTJGFJGbRJsChC3ghsreqM6XRN8Wp/LfUMu0uDIRTd9hNfAILBhnR990SqtOCBzZD95wAAQAAAgAAIQIym81NJoZizqMJC35E24XvdLTE8LlTNjvxHYBiftbrjEEfv9Nwebzuh0v7QaTzdH2gC1drl5IbX9bQFh1f',
  ],
]

describe('transitionTarget', () => {
  it.each(NAMES_A_CONTRACT)('reads the contract of %s', (_, data, want) => {
    expect(transitionTarget(data)).toEqual(want)
  })

  it.each(NAMES_NONE)('finds no contract in %s', (_, data) => {
    expect(transitionTarget(data)).toBeUndefined()
  })

  it('gives up on bytes it cannot follow', () => {
    expect(transitionTarget(undefined)).toBeUndefined()
    expect(transitionTarget('')).toBeUndefined()
    expect(transitionTarget('not base64!')).toBeUndefined()
    expect(transitionTarget('AgE=')).toBeUndefined()
    expect(transitionTarget(btoa(String.fromCharCode(2, 9)))).toBeUndefined()
  })
})
