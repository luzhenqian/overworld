import { ImageResponse } from 'next/og';

export const runtime = 'edge';

export function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '64px 68px 58px',
          color: '#151a17',
          background: '#f4f4ef',
          fontFamily: 'sans-serif',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingBottom: 22,
            borderBottom: '2px solid #151a17',
            fontSize: 18,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
          }}
        >
          <span>Overworld / v3.2</span>
          <span style={{ color: '#116b4d' }}>Open source / MIT</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div
            style={{
              maxWidth: 980,
              fontSize: 82,
              lineHeight: 1.04,
              letterSpacing: '-0.045em',
              fontWeight: 650,
            }}
          >
            Modular systems for Web 3D RPGs.
          </div>
          <div style={{ color: '#5f6862', fontSize: 28 }}>
            Keep the composition. Choose the packages.
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
            paddingTop: 22,
            borderTop: '1px solid #aeb5b0',
            fontSize: 20,
          }}
        >
          <div style={{ display: 'flex', gap: 28, color: '#116b4d', fontWeight: 650 }}>
            <span>27 packages</span>
            <span>TypeScript</span>
            <span>ESM</span>
          </div>
          <span style={{ color: '#5f6862' }}>overworld.web3noah.com</span>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    },
  );
}
