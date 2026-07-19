import { describe, it, expect } from 'vitest';
import { mergeStoreWithDraft } from '../store.service';
import type { IStore } from '../../models/Store.model';

// mergeStoreWithDraft est la brique la plus critique du preview draft :
// c'est ce que la storefront lit quand le vendeur édite son formulaire COD
// (couleurs, forme du bouton, champs visibles…) et voit son aperçu changer
// en temps réel. Un bug ici = le vendeur voit du LIVE alors qu'il croit
// voir son draft, ou pire, un draft leak vers le visiteur.

function baseStore(overrides: Partial<IStore> = {}): IStore {
  // Cast large : on nourrit un plain object qui matche IStore côté runtime,
  // sans les méthodes Mongoose Document (le service accepte les .lean()).
  return {
    _id: 'store-1',
    ownerId: 'owner-1',
    name: 'Boutique Live',
    slug: 'live',
    subdomain: 'live',
    storeType: 'physical',
    description: 'Live description',
    logo: '/logo-live.png',
    isPublished: true,
    theme: { templateId: 'volt', primary: '#000' },
    settings: {
      currency: 'XOF',
      codForm: {
        headline: 'Live headline',
        buttonColor: '#ff0000',
        buttonShape: 'rounded',
        showEmail: true,
      },
    },
    integrations: { marketing: { facebookPixelId: 'live-pixel' } },
    ...overrides,
  } as unknown as IStore;
}

describe('mergeStoreWithDraft', () => {
  it('renvoie le store live inchangé quand aucun draft', () => {
    const store = baseStore();
    const merged = mergeStoreWithDraft(store);
    expect(merged).toBe(store);
    expect(merged.settings?.codForm?.headline).toBe('Live headline');
  });

  it('remplace la config codForm complète quand settings est dans le draft', () => {
    const store = baseStore({
      previewDraft: {
        settings: {
          currency: 'XOF',
          codForm: {
            headline: 'Draft headline',
            buttonColor: '#00ff00',
            buttonShape: 'pill',
            buttonAnimation: 'pulse',
            buttonAnimated: true,
            showEmail: false,
            showAddressLine2: true,
            showCity: true,
            showPostalCode: true,
            showState: true,
            showNotes: true,
            showQuantity: true,
            reassurance: 'Sans carte',
            shippingFee: 500,
          },
        },
      },
    });
    const merged = mergeStoreWithDraft(store);
    // Les champs draftés doivent l'emporter sur le live.
    expect(merged.settings?.codForm?.headline).toBe('Draft headline');
    expect(merged.settings?.codForm?.buttonColor).toBe('#00ff00');
    expect(merged.settings?.codForm?.buttonShape).toBe('pill');
    expect(merged.settings?.codForm?.buttonAnimation).toBe('pulse');
    expect(merged.settings?.codForm?.showEmail).toBe(false);
    expect(merged.settings?.codForm?.showAddressLine2).toBe(true);
    expect(merged.settings?.codForm?.shippingFee).toBe(500);
  });

  it('fusionne les modifs top-level (name, logo, isPublished)', () => {
    const store = baseStore({
      previewDraft: {
        name: 'Nom draft',
        logo: '/logo-draft.png',
        isPublished: false,
      },
    });
    const merged = mergeStoreWithDraft(store);
    expect(merged.name).toBe('Nom draft');
    expect(merged.logo).toBe('/logo-draft.png');
    expect(merged.isPublished).toBe(false);
  });

  it('conserve les champs live NON présents dans le draft', () => {
    const store = baseStore({
      previewDraft: {
        // Le draft ne touche que theme — le reste doit rester intact.
        theme: { templateId: 'atelier', primary: '#0000ff' },
      },
    });
    const merged = mergeStoreWithDraft(store);
    expect(merged.theme).toEqual({ templateId: 'atelier', primary: '#0000ff' });
    // Non touché → live conservé.
    expect(merged.name).toBe('Boutique Live');
    expect(merged.settings?.codForm?.buttonColor).toBe('#ff0000');
    expect(merged.integrations?.marketing?.facebookPixelId).toBe('live-pixel');
  });

  it('ne renvoie JAMAIS previewDraft au caller (état privé au dashboard)', () => {
    const store = baseStore({
      previewDraft: { name: 'Nom draft' },
    });
    const merged = mergeStoreWithDraft(store);
    expect(merged.previewDraft).toBeUndefined();
  });

  it('ignore les types incorrects dans le draft (défense en profondeur)', () => {
    const store = baseStore({
      previewDraft: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        name: 123 as any,           // pas une string → ignoré
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        isPublished: 'yes' as any,   // pas un boolean → ignoré
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        theme: 'not-an-object' as any,
      },
    });
    const merged = mergeStoreWithDraft(store);
    // Les champs corrompus n'écrasent PAS le live — sinon on servirait des
    // données invalides à la storefront et le rendu casserait.
    expect(merged.name).toBe('Boutique Live');
    expect(merged.isPublished).toBe(true);
    expect(merged.theme).toEqual({ templateId: 'volt', primary: '#000' });
  });

  it('empile les modifications COD dans un scénario réaliste multi-édition', () => {
    // Le vendeur ouvre l'éditeur, change 3 choses successivement — le draft
    // final est réécrit entier à chaque fois (le dashboard poste toujours
    // le snapshot complet dirty).
    const store = baseStore({
      previewDraft: {
        settings: {
          currency: 'XOF',
          codForm: {
            headline: 'Commander maintenant',   // modif 1
            buttonColor: '#7c3aed',              // modif 2 (violet)
            buttonShape: 'pill',                 // modif 3
            buttonAnimation: 'shimmer',
            buttonAnimated: true,
            showEmail: true,
            requireEmail: false,
            showAddressLine2: true,
            showPostalCode: true,
            showNotes: true,
            showQuantity: true,
            shippingFee: 1000,
          },
        },
      },
    });
    const merged = mergeStoreWithDraft(store);
    expect(merged.settings?.codForm?.headline).toBe('Commander maintenant');
    expect(merged.settings?.codForm?.buttonColor).toBe('#7c3aed');
    expect(merged.settings?.codForm?.buttonShape).toBe('pill');
    expect(merged.settings?.codForm?.buttonAnimation).toBe('shimmer');
    expect(merged.settings?.codForm?.shippingFee).toBe(1000);
    // Le previewDraft ne fuit pas.
    expect(merged.previewDraft).toBeUndefined();
  });
});
